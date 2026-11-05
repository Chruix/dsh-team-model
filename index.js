/**
 * dsh-team-model — Agent Teams 队友模型（Host 半边）
 *
 * 交付四件事：
 *  1. `spawn_teammate_with_model`：内置 spawn_teammate 的参数 + provider/model/reasoning_effort。
 *  2. 模型真正生效：子会话创建时提交一条 durable `model/selection`，首轮请求即使用该路由；
 *     后续轮次由 `agent/request` waterfall 按会话投影钉住，不会回落到继承模型。
 *  3. loopback RPC `/dsh-team-model`：tm.state / tm.setModel / tm.globals / tm.setAll，
 *     供会话头部、输入框工具行、设置页三个 UI 入口读取目录与名册并切换。
 *  4. 批量设置：跨会话聚合所有在线团队，支持单个或整队统一切换（离线队友排队到下次启动）。
 *
 * 设计取舍：不改写 subagents 服务、不复制内置工具插件，只用「新增工具 + 既有事件类型 + 会话投影」
 * 三个公开面，因此内置的 spawn_teammate / list_agents / team_task_* 与团队策略文本原样保留。
 */
import { AsyncLocalStorage } from 'node:async_hooks';

const CHANNEL = '/dsh-team-model';
const ENDPOINTS = new Set(['tm.state', 'tm.setModel', 'tm.globals', 'tm.setAll']);
const TOOL_NAME = 'spawn_teammate_with_model';
const SELECTION_EVENT = 'model/selection';

/** Cordis 插件名。 */
export const name = 'team-model';
/** 需要的 Host 服务；缺少任一则该 profile 不激活本插件。 */
export const inject = ['agents', 'agentTeams', 'tools', 'systemPrompt', 'sessionController', 'llm', 'connection', 'webServer'];

const DEFAULTS = {
	/** 未显式指定时的默认队友模型（"provider/model" 或裸 model id）。 */
	defaultModel: '',
	/** 默认模型所属提供方；留空时按目录里唯一匹配推断。 */
	defaultProvider: '',
	/** 与内置工具插件一致的路由名。 */
	freshProvider: 'spawn',
	forkProvider: 'fork',
	/** 是否注册 spawn_teammate_with_model。 */
	tool: true,
	/** 是否给 Lead 注入一段说明。 */
	policy: true
};

const POLICY = `Teammate models

Each teammate can run on a model of your choosing. \`spawn_teammate_with_model\` takes the same arguments as \`spawn_teammate\` plus optional \`provider\`, \`model\` and \`reasoning_effort\`; omit them to inherit this session's model. Prefer it whenever a teammate's task suits a different model — a cheaper model for mechanical work, a stronger one for reasoning-heavy work — and tell the user which model you picked and why.

The user can also switch any teammate's model from the composer toolbar or the session header; that change applies from the teammate's next request and sticks for later turns. \`list_agents\` reports the model a teammate was created with.`;

function ok(value) {
	return { ok: true, value };
}

function fail(error) {
	return { ok: false, error: { message: error instanceof Error ? error.message : String(error ?? 'unknown error') } };
}

function headerOf(agent) {
	try {
		return agent?.session?.header?.();
	} catch {
		return undefined;
	}
}

function selectionOf(agent) {
	const config = headerOf(agent)?.config;
	if (config === undefined) return undefined;
	return {
		provider: config.provider,
		model: config.model,
		...(config.reasoningEffort === undefined ? {} : { reasoningEffort: config.reasoningEffort })
	};
}

function routeLabel(selection) {
	return selection === undefined ? undefined : `${selection.provider}/${selection.model}`;
}

/**
 * 注册本插件。
 * @param ctx - Host 上下文，含 inject 声明的服务。
 * @param config - Loader 行 config，覆盖 DEFAULTS。
 */
export function apply(ctx, config = {}) {
	const resolved = { ...DEFAULTS, ...(config !== null && typeof config === 'object' ? config : {}) };
	/** 一次 spawn 内携带目标路由（子会话创建发生在同一条 async 调用链里）。 */
	const spawned = new AsyncLocalStorage();
	/** 子会话暂时没有活 Agent 时先记住，等它下次创建再落地。 */
	const queued = new Map();

	function warn(error) {
		try {
			const logger = ctx.logger;
			const target = typeof logger === 'function' ? logger('team-model') : logger;
			target?.warn?.(`team-model: ${error instanceof Error ? error.message : String(error)}`);
		} catch {
			/* 记录日志失败不影响主流程 */
		}
	}

	/** 把一条路由写进会话日志（durable），并同步给已装载的选择对象。 */
	const appliedRoutes = new WeakMap();
	/** 会话 → 最近一次由本插件写入的路由（成员已休眠时 UI 仍要显示真实模型）。 */
	const chosen = new Map();
	function applySelection(agent, selection) {
		const key = routeLabel(selection);
		if (key !== undefined && appliedRoutes.get(agent) === key) return true;
		if (key !== undefined) { appliedRoutes.set(agent, key); chosen.set(agent.id, selection); }
		let recorded = false;
		try {
			/* ctx.sessionController.agents 是 ApiSessionAgentController：
			   selectForNextRequest 会追加 durable 的 model/selection 并同步 .current。 */
			const controller = ctx.sessionController?.agents;
			if (controller !== undefined && typeof controller.selectForNextRequest === 'function') {
				controller.selectForNextRequest(agent, selection);
				recorded = true;
			} else {
				agent.session.append(SELECTION_EVENT, selection);
				recorded = true;
				if (controller !== undefined && typeof controller.selectionFor === 'function') {
					controller.selectionFor(agent).current = selection;
				}
			}
		} catch (error) {
			warn(error);
			if (!recorded) {
				try {
					agent.session.append(SELECTION_EVENT, selection);
					recorded = true;
				} catch (appendError) {
					warn(appendError);
				}
			}
		}
		return recorded;
	}

	/** 有活 Agent 就立刻落地，否则排队等 agent/created。 */
	function applyOrQueue(sessionId, selection) {
		const live = typeof sessionId === 'string' ? ctx.agents.get(sessionId) : undefined;
		if (live === undefined) {
			queued.set(sessionId, selection);
			return { applied: false, queued: true };
		}
		return { applied: applySelection(live, selection), queued: false };
	}

	/** 把 "provider/model" 或裸 model id 解析成经过 llm 归一化的路由。 */
	async function normalizeSelection(request) {
		let provider = typeof request?.provider === 'string' && request.provider.trim() !== '' ? request.provider.trim() : undefined;
		let model = typeof request?.model === 'string' && request.model.trim() !== '' ? request.model.trim() : undefined;
		const reasoningEffort = typeof request?.reasoningEffort === 'string' && request.reasoningEffort.trim() !== '' ? request.reasoningEffort.trim() : undefined;

		if (model === undefined && provider === undefined) return undefined;
		if (model !== undefined && provider === undefined && model.includes('/')) {
			const cut = model.indexOf('/');
			provider = model.slice(0, cut);
			model = model.slice(cut + 1);
		}
		if (model === undefined) throw new Error('a model id is required when provider is given');
		if (provider === undefined) {
			const groups = await catalogGroups();
			const matches = groups.filter((group) => group.models.some((entry) => entry.id === model));
			if (matches.length === 1) provider = matches[0].id;
			else if (matches.length > 1) throw new Error(`model "${model}" exists in ${matches.map((group) => group.id).join(', ')}; pass provider explicitly`);
			else throw new Error(`no provider offers model "${model}"`);
		}

		let normalized;
		try {
			normalized = await ctx.llm.resolveCallConfig({
				provider,
				model,
				...(reasoningEffort === undefined ? {} : { reasoningEffort })
			});
		} catch (error) {
			throw new Error(`cannot route ${provider}/${model}: ${error instanceof Error ? error.message : String(error)}`);
		}
		return {
			provider: normalized.provider,
			model: normalized.model,
			...(normalized.reasoningEffort === undefined ? {} : { reasoningEffort: normalized.reasoningEffort })
		};
	}

	async function catalogGroups() {
		try {
			const catalog = await ctx.sessionController.modelCatalog();
			return Array.isArray(catalog?.groups) ? catalog.groups : [];
		} catch (error) {
			warn(error);
			return [];
		}
	}

	/** 活 Agent 的"下一个请求将使用"的路由；没有活选择时退回最近一次请求头。 */
	function projectionRoute(session) {
		try {
			const projections = ctx.get('sessionProjections');
			const state = projections?.stateOf?.(session, 'modelSelection');
			return state?.pending ?? state?.lastUsed ?? undefined;
		} catch {
			return undefined;
		}
	}

	/** 不在线的队友：从持久化会话里读它最近一次真正用过的路由。 */
	/** 不在线的队友：从持久化会话里读它最近一次真正用过的路由（带 15s 缓存，避免每次开菜单都读盘）。 */
	const persistedCache = new Map();

	async function persistedProjection(sessionId) {
		const cached = persistedCache.get(sessionId);
		if (cached !== undefined && Date.now() - cached.at < 15000) return cached.value;
		let value;
		try {
			const reply = await ctx.sessionController.projections({ sessionId }, AbortSignal.timeout(1500));
			const selection = reply?.values?.modelSelection;
			const picked = selection?.pending ?? selection?.lastUsed ?? undefined;
			if (picked !== undefined && typeof picked.provider === 'string' && typeof picked.model === 'string') {
				value = {
					provider: picked.provider,
					model: picked.model,
					...(picked.reasoningEffort === undefined ? {} : { reasoningEffort: picked.reasoningEffort })
				};
			}
		} catch {
			value = undefined;
		}
		persistedCache.set(sessionId, { at: Date.now(), value });
		return value;
	}

	function persistedRoute(sessionId) {
		try {
			const session = ctx.sessions.get(sessionId);
			if (session === undefined) return undefined;
			const config = session.requestHeader?.()?.config;
			if (config !== undefined && typeof config.provider === 'string' && typeof config.model === 'string') {
				return {
					provider: config.provider,
					model: config.model,
					...(config.reasoningEffort === undefined ? {} : { reasoningEffort: config.reasoningEffort })
				};
			}
			return projectionRoute(session);
		} catch {
			/* 会话还没持久化或服务不可用时忽略 */
		}
		return undefined;
	}

	function liveSelection(agent) {
		if (agent === undefined) return undefined;
		const projected = projectionRoute(agent.session);
		if (projected !== undefined && typeof projected.provider === 'string' && typeof projected.model === 'string') {
			return {
				provider: projected.provider,
				model: projected.model,
				...(projected.reasoningEffort === undefined ? {} : { reasoningEffort: projected.reasoningEffort })
			};
		}
		try {
			const held = ctx.sessionController?.agents?.selectionFor?.(agent);
			const value = held?.current;
			if (value !== undefined && typeof value.provider === 'string' && typeof value.model === 'string') {
				return {
					provider: value.provider,
					model: value.model,
					...(value.reasoningEffort === undefined ? {} : { reasoningEffort: value.reasoningEffort })
				};
			}
		} catch {
			/* 投影未注册或服务不可用时退回请求头 */
		}
		return selectionOf(agent);
	}

	/** 找出某个会话所属团队的 Lead Agent。 */
	function leadAgentFor(sessionId) {
		const direct = typeof sessionId === 'string' && sessionId !== '' ? ctx.agents.get(sessionId) : undefined;
		if (direct !== undefined) {
			const membership = ctx.agentTeams.tryMembership(direct);
			if (membership?.role === 'lead') return direct;
			if (membership !== undefined) {
				// 队友：找它所在的团队。活动的 Agent 拿不到 session 头（header 为 null），
				// 所以先在在线 Lead 的名单里按 id 认领，认不到才退回会话头。
				const fromRoster = leadContaining(direct.id);
				if (fromRoster !== undefined) return fromRoster;
				const parentId = headerOf(direct)?.parentSession;
				return parentId === undefined ? undefined : ctx.agents.get(parentId);
			}
			return undefined;
		}
		// 会话本身没有活 Agent 时，只有在"恰好一个在线 Lead"的情况下才敢认领。
		const leads = ctx.agents.list().filter((agent) => ctx.agentTeams.tryMembership(agent)?.role === 'lead');
		return leads.length === 1 ? leads[0] : undefined;
	}

	/** 在在线 Lead 的成员名单里找包含 sessionId 的那支团队。 */
	function leadContaining(sessionId) {
		for (const agent of ctx.agents.list()) {
			if (ctx.agentTeams.tryMembership(agent)?.role !== 'lead') continue;
			try {
				const members = ctx.agentTeams.listMembers(agent);
				if (Array.isArray(members) && members.some((member) => member.id === sessionId)) return agent;
			} catch {
				/* 单个团队读失败不影响其它团队 */
			}
		}
		return undefined;
	}

	function memberView(member) {
		const live = ctx.agents.get(member.id);
		const current = liveSelection(live) ?? queued.get(member.id) ?? chosen.get(member.id) ?? persistedRoute(member.id);
		return {
			id: member.id,
			name: member.name,
			role: member.role,
			status: member.status,
			context: member.context,
			spawnProvider: member.provider,
			model: current?.model ?? member.model,
			providerId: current?.provider,
			reasoningEffort: current?.reasoningEffort,
			live: live !== undefined
		};
	}

	async function state(payload) {
		const requestedId = typeof payload?.sessionId === 'string' && payload.sessionId !== '' ? payload.sessionId : undefined;
		const lead = leadAgentFor(payload?.leadSessionId ?? requestedId);
		const catalog = await ctx.sessionController.modelCatalog().catch(() => ({ groups: [] }));
		const defaults = { provider: resolved.defaultProvider, model: resolved.defaultModel };
		if (lead === undefined) {
			// Lead 不在线时仍然给出"当前这个会话自己"的一条，让队友会话里的入口可用。
			const self = requestedId === undefined ? undefined : ctx.agents.get(requestedId);
			const current = requestedId === undefined ? undefined : (liveSelection(self) ?? queued.get(requestedId) ?? chosen.get(requestedId));
			const members = requestedId === undefined ? [] : [{
				id: requestedId,
				name: '',
				role: 'teammate',
				status: self === undefined ? 'inactive' : 'running',
				model: current?.model,
				providerId: current?.provider,
				reasoningEffort: current?.reasoningEffort,
				live: self !== undefined
			}];
			return { leadSessionId: payload?.leadSessionId ?? null, selfId: requestedId ?? null, members, catalog, defaults, problem: 'lead session is not live' };
		}
		const members = ctx.agentTeams.listMembers(lead);
		const views = (Array.isArray(members) ? members : []).map(memberView);
		/* 在"不是团队成员"的子会话（例如普通 subagent）里打开时，名单里没有自己，
		   补一条只有自己的合成项，UI 才能聚焦当前会话。 */
		if (requestedId !== undefined && views.every((view) => view.id !== requestedId)) {
			const self = ctx.agents.get(requestedId);
			const current = liveSelection(self) ?? queued.get(requestedId) ?? chosen.get(requestedId);
			views.unshift({
				id: requestedId,
				name: '',
				role: 'teammate',
				status: self === undefined ? 'inactive' : 'running',
				model: current?.model,
				providerId: current?.provider,
				reasoningEffort: current?.reasoningEffort,
				live: self !== undefined
			});
		}
		/* 休眠的队友：名册里的 model 是创建时的继承值，会误导人。
		   从持久化会话的投影里补上"它最近一次真正用过的模型"。 */
		await Promise.all(views.map(async (view) => {
			if (view.live === true) return;
			if (queued.has(view.id) || chosen.has(view.id)) return;
			const persisted = await persistedProjection(view.id);
			if (persisted !== undefined) {
				view.providerId = persisted.provider;
				view.model = persisted.model;
				view.reasoningEffort = persisted.reasoningEffort;
			}
		}));
		return {
			leadSessionId: lead.id,
			selfId: requestedId ?? null,
			members: views,
			catalog,
			defaults,
			problem: null
		};
	}

	async function setModel(payload) {
		const sessionId = typeof payload?.sessionId === 'string' ? payload.sessionId : '';
		if (sessionId === '') throw new Error('sessionId is required');
		const selection = await normalizeSelection(payload);
		if (selection === undefined) throw new Error('provider or model is required');
		const agent = ctx.agents.get(sessionId);
		if (agent === undefined) {
			queued.set(sessionId, selection);
			return { applied: false, queued: true, sessionId, selection };
		}
		queued.delete(sessionId);
		return { applied: applySelection(agent, selection), queued: false, sessionId, selection };
	}

	/** 把"离线队友最后一次真正用过的模型"补进视图，名册里的继承值会误导人。 */
	async function fillPersisted(views) {
		await Promise.all(views.map(async (view) => {
			if (view.live === true) return;
			if (queued.has(view.id) || chosen.has(view.id)) return;
			const persisted = await persistedProjection(view.id);
			if (persisted !== undefined) {
				view.providerId = persisted.provider;
				view.model = persisted.model;
				view.reasoningEffort = persisted.reasoningEffort;
			}
		}));
		return views;
	}

	/** 会话标题（设置页用它区分"哪个会话的队友"）。标题服务可选，缺失时返回 undefined。 */
	function sessionTitleOf(agent) {
		try {
			const titles = ctx.get('sessionTitle');
			if (titles === undefined || typeof titles.get !== 'function') return undefined;
			const snapshot = titles.get(agent.session);
			const text = typeof snapshot === 'string' ? snapshot : snapshot?.title;
			return typeof text === 'string' && text.trim() !== '' ? text.trim() : undefined;
		} catch {
			return undefined;
		}
	}

	/** 全局视图：每个在线 Lead 团队 + 名册，设置页用它一次列出所有队友。 */
	async function globals() {
		const catalog = await ctx.sessionController.modelCatalog().catch(() => ({ groups: [] }));
		const defaults = { provider: resolved.defaultProvider, model: resolved.defaultModel };
		const teams = [];
		const seen = new Set();
		for (const agent of ctx.agents.list()) {
			if (seen.has(agent.id)) continue;
			let membership;
			try {
				membership = ctx.agentTeams.tryMembership(agent);
			} catch {
				membership = undefined;
			}
			if (membership?.role !== 'lead') continue;
			seen.add(agent.id);
			let members;
			try {
				members = ctx.agentTeams.listMembers(agent);
			} catch {
				members = [];
			}
			const views = await fillPersisted((Array.isArray(members) ? members : []).map(memberView));
			const leadView = views.find((view) => view.role === 'lead');
			const teammates = views.filter((view) => view.role === 'teammate');
			/* 每个会话自成一支团队，没队友的会话不占设置页的位置。 */
			if (teammates.length === 0) continue;
			teams.push({
				leadId: agent.id,
				leadName: leadView?.name === undefined || leadView.name === '' ? 'lead' : leadView.name,
				leadTitle: sessionTitleOf(agent),
				lead: leadView ?? null,
				members: teammates
			});
		}
		return { teams, catalog, defaults };
	}

	/** 批量设置：给了 sessionIds 就只改这些，否则改所有团队的队友。 */
	async function setAll(payload) {
		const selection = await normalizeSelection(payload);
		if (selection === undefined) throw new Error('provider or model is required');
		const explicit = Array.isArray(payload?.sessionIds)
			? payload.sessionIds.filter((id) => typeof id === 'string' && id !== '')
			: [];
		let targets = explicit;
		if (targets.length === 0) {
			const snapshot = await globals();
			targets = snapshot.teams.flatMap((team) => team.members.map((member) => member.id));
		}
		let applied = 0;
		let queuedCount = 0;
		const failures = [];
		for (const id of targets) {
			try {
				const agent = ctx.agents.get(id);
				if (agent === undefined) {
					queued.set(id, selection);
					queuedCount += 1;
					continue;
				}
				queued.delete(id);
				applySelection(agent, selection);
				applied += 1;
			} catch (error) {
				failures.push({ sessionId: id, message: String(error?.message ?? error) });
			}
		}
		return { applied, queued: queuedCount, total: targets.length, selection, failures };
	}

	/** 给一个 Team 成员装配工具与（Lead 的）说明段。 */
	function install(agent) {
		const scoped = agent.ctx;
		const disposers = [];
		const membership = ctx.agentTeams.tryMembership(agent);
		/* 子会话判定不能看 session 头：agent/created 与首次请求时 header() 都还是 null
		   （实测 parentSession 恒为 null），而 tryMembership 对队友 agent 稳定返回 role=teammate。 */
		const teammate = membership?.role === 'teammate';

		if (resolved.tool) {
			disposers.push(scoped.tools.register({
				name: TOOL_NAME,
				description: 'Create one named, durable teammate, optionally choosing the model it runs on. Same arguments as spawn_teammate plus provider/model/reasoning_effort; omit them to inherit this session\'s model. Only the Team Lead may call this tool.',
				parameters: {
					type: 'object',
					additionalProperties: false,
					properties: {
						name: { type: 'string', description: 'Unique lower-kebab-case teammate name.' },
						description: { type: 'string', description: 'Short description of the delegated responsibility.' },
						prompt: { type: 'string', description: 'Complete initial task for the teammate.' },
						context: { type: 'string', enum: ['fresh', 'fork'], description: 'fresh starts without Lead history; fork inherits completed Lead turns. Defaults to fresh.' },
						model: { type: 'string', description: 'Model id for the teammate, or "provider/model". Omit to inherit this session\'s model.' },
						provider: { type: 'string', description: 'Provider id for model; inferred from the catalog when unambiguous.' },
						reasoning_effort: { type: 'string', description: 'Adapter-owned reasoning effort for the teammate.' }
					},
					required: ['name', 'description', 'prompt']
				},
				output: {
					schema: { type: 'object' },
					render(_args, value) {
						return [{ type: 'text', text: JSON.stringify(value ?? null) }];
					}
				},
				async execute(args, exec) {
					const caller = exec?.agent;
					if (caller === undefined) throw new Error(`${TOOL_NAME}: no calling agent`);
					const context = args?.context === 'fork' ? 'fork' : 'fresh';
					const requested = await normalizeSelection({
						provider: args?.provider ?? resolved.defaultProvider,
						model: args?.model ?? resolved.defaultModel,
						reasoningEffort: args?.reasoning_effort
					});
					const request = {
						name: args?.name,
						description: args?.description,
						prompt: [{ type: 'text', text: String(args?.prompt ?? '') }],
						context,
						provider: context === 'fork' ? resolved.forkProvider : resolved.freshProvider,
						signal: exec?.signal
					};
					const spawn = () => ctx.agentTeams.spawnTeammate(caller, request);
					const result = requested === undefined
						? await spawn()
						: await spawned.run({ leadId: caller.id, selection: requested, at: Date.now() }, spawn);
					const member = result?.member ?? result;
					let applied;
					if (requested !== undefined && member?.id !== undefined) {
						applied = applyOrQueue(member.id, requested);
					}
					return {
						target: member?.name,
						role: member?.role,
						context: member?.context,
						status: member?.status,
						model: routeLabel(requested) ?? null,
						route: member?.model ?? null,
						applied: applied ?? null
					};
				}
			}));
		}


		if (resolved.policy && membership?.role === 'lead') {
			const base = scoped.systemPrompt.getSectionOrder('TEAM_POLICY');
			disposers.push(scoped.systemPrompt.section({
				name: 'team:model',
				order: typeof base === 'number' ? base + 1 : 41,
				text: () => POLICY
			}));
		}

		/* 队友子会话的模型选择是"一次性"的：内置 selection 被本轮请求 consume 之后，
		   current 会回退到默认模型，于是用户切过去的模型只顶一轮就掉回继承值。
		   这里把该会话最近一次真正用过的路由（投影 modelSelection.lastUsed）钉住：
		   每次请求都按它覆盖，直到有人写下新的 model/selection 事件（例如再切一次）。 */
		try {
			const projections = ctx.get('sessionProjections');
			trace({ step: 'install-pin', agent: agent?.id, hasProjections: projections !== undefined });
			if (projections !== undefined) {
				disposers.push(scoped.on('agent/request', async (_payload, next) => {
					const resolved = await next();
					if (!teammate) return resolved;
					let pinned;
					try {
						const state = projections.stateOf(agent.session, 'modelSelection');
						pinned = state?.pending ?? state?.lastUsed ?? undefined;
					} catch (error) {
						trace({ step: 'pin-error', agent: agent?.id, error: String(error && error.message) });
						pinned = undefined;
					}
					trace({ step: 'pin', agent: agent?.id, pinned: pinned ?? null, resolved: { provider: resolved?.provider, model: resolved?.model } });
					if (pinned === undefined) return resolved;
					const { reasoningEffort: _inherited, ...rest } = resolved;
					return {
						...rest,
						provider: pinned.provider,
						model: pinned.model,
						...(pinned.reasoningEffort === undefined ? {} : { reasoningEffort: pinned.reasoningEffort })
					};
				}));
			}
		} catch (error) {
			warn(error);
		}

		return () => {
			for (const dispose of disposers.reverse()) {
				try {
					dispose?.();
				} catch (error) {
					warn(error);
				}
			}
		};
	}

	const installed = new Map();
	const TRACE = [];
	const trace = (record) => {
		TRACE.push(record);
		if (TRACE.length > 40) TRACE.shift();
	};
	const installOnce = (agent) => {
		if (installed.has(agent)) return;
		if (ctx.agentTeams.tryMembership(agent) === undefined) return;
		installed.set(agent, install(agent));
	};

	ctx.effect(() => {
		for (const agent of ctx.agents.list()) installOnce(agent);
		return () => {
			for (const dispose of installed.values()) dispose();
			installed.clear();
		};
	}, 'team-model: member scopes');

	ctx.on('agent/created', ({ agent }) => {
		const pending = spawned.getStore();
		const inherited = headerOf(agent);
		/* agent/created 时 session 头往往还没写（parentSession 为 null），
		   所以除了"父会话匹配"之外，还接受"不是 Lead 自己、且 spawn 就在不久前"的候选。 */
		const parent = inherited?.parentSession ?? null;
		const recent = pending !== undefined && Date.now() - (pending.at ?? 0) < 15000;
		const matched = pending?.selection !== undefined
			&& agent.id !== pending.leadId
			&& (parent === pending.leadId || (parent === null && recent));
		let applied;
		if (matched) {
			applied = applySelection(agent, pending.selection);
		}
		trace({
			at: Date.now(),
			agent: agent?.id,
			hasStore: pending !== undefined,
			leadId: pending?.leadId ?? null,
			parentSession: parent,
			selection: pending?.selection ?? null,
			matched,
			applied
		});
		const remembered = queued.get(agent.id);
		if (remembered !== undefined) {
			queued.delete(agent.id);
			applySelection(agent, remembered);
		}
		installOnce(agent);
	});

	ctx.on('agent/disposed', ({ agent }) => {
		installed.get(agent)?.();
		installed.delete(agent);
	});

	// connection.rpc.handle 在本机这条链上不可用：它会把注册落到"connection 服务自己的 ctx"上，
	// 那个 ctx 读不到 webServer（实测恒报 `cannot get property "webServer" without inject`，
	// 连社区插件 dsh-math-modeling-ui 的通道也没注册成功）。所以这里按 dshmarket 的做法，
	// 直接在 webServer 上挂一个 prefix 路由，并自己实现 connection 客户端的 RPC 线上格式：
	//   POST <CHANNEL>/<endpoint>  { type:"client-request", rpcId, method, payload }
	//   ← 200 { type:"server-response", rpcId, result: { ok:true, value } | { ok:false, error } }
	const LOOPBACK_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/iu;
	const rpcHandler = async (request, response) => {
		const reply = (status, body) => {
			response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
			response.end(JSON.stringify(body));
		};
		let pathname = '/';
		try {
			pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
		} catch {
			return reply(404, { error: 'not found' });
		}
		const prefix = `${CHANNEL}/`;
		const endpoint = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : '';
		if (request.method !== 'POST' || endpoint === '') return reply(404, { error: 'not found' });
		if (!ENDPOINTS.has(endpoint)) return reply(404, { error: 'not found' });
		if (!LOOPBACK_HOST.test(String(request.headers.host ?? ''))) return reply(403, { error: 'forbidden' });
		if (String(request.headers['content-type'] ?? '').split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
			return reply(415, { error: 'content type must be application/json' });
		}
		let raw = '';
		for await (const chunk of request) raw += chunk;
		let message;
		try {
			message = JSON.parse(raw);
		} catch {
			return reply(400, { error: 'body is not JSON' });
		}
		const rpcId = message?.rpcId;
		try {
			const value = await handler(endpoint, message?.payload ?? {});
			const result = value?.ok === false
				? { ok: false, error: value.error ?? { code: 'bad-request', message: 'request failed', details: { issues: [] } } }
				: { ok: true, value: value?.value };
			reply(200, { type: 'server-response', rpcId, result });
		} catch (error) {
			warn(error);
			reply(200, {
				type: 'server-response',
				rpcId,
				result: { ok: false, error: { code: 'internal', message: String(error?.message ?? error), details: { issues: [] } } }
			});
		}
	};
	let rpcInstalled = false;
	const installRpc = (label) => {
		if (rpcInstalled) return;
		try {
			const web = ctx.get('webServer');
			if (web === undefined) throw new Error('webServer service is not available yet');
			const dispose = web.register({ kind: 'prefix', path: CHANNEL, handler: rpcHandler });
			rpcInstalled = true;
			trace({ step: 'rpc-registered', label, disposer: typeof dispose });
			ctx.effect(() => dispose, 'team-model: rpc');
		} catch (error) {
			trace({ step: 'rpc-failed', label, error: String(error?.message ?? error) });
		}
	};
	const handler = async (endpoint, payload = {}) => {
		try {
			if (endpoint === 'tm.state') return ok(await state(payload));
			if (endpoint === 'tm.setModel') return ok(await setModel(payload));
			if (endpoint === 'tm.globals') return ok(await globals());
			if (endpoint === 'tm.setAll') return ok(await setAll(payload));
			return fail(`unknown endpoint: ${String(endpoint)}`);
		} catch (error) {
			warn(error);
			return fail(error);
		}
	};
	installRpc('apply');
	setTimeout(() => installRpc('timer'), 2000).unref?.();
	ctx.on('agent/created', () => installRpc('agent-created'));
	/* 诊断：apply 时的 ctx 到底能不能看见 webServer（区分"未注入"还是"未就绪"）。 */
	try {
		const describe = (value) => (value === undefined ? 'undefined' : typeof value === 'object' && value !== null ? 'object' : typeof value);
		trace({
			step: 'apply-probe',
			viaGet: describe(ctx.get('webServer')),
			viaGetConnection: describe(ctx.get('connection')),
			hasInjected: (() => {
				try {
					return 'webServer' in (ctx.fiber?.inject ?? {});
				} catch (error) {
					return `ERR:${error?.message ?? error}`;
				}
			})(),
			runtime: ctx.fiber?.runtime === undefined ? 'undefined' : typeof ctx.fiber.runtime
		});
	} catch (error) {
		trace({ step: 'apply-probe-failed', error: String(error?.message ?? error) });
	}
}

apply.inject = inject;
