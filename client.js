window.__ModuleLoader__.load({
	id: 'dsh-team-model',
	factory: (require) => {
		const React = require('react');
		const ReactDOM = require('react-dom');
		const primitives = require('@deepseek-ai/dsh-client-ui-primitives');

		const CHANNEL = '/dsh-team-model';
		const CSS_ID = 'dsh-team-model/TeamModel.module.css';

		/* 视觉语言照抄官方 TeamAction 与 ModelSelect：菜单是 fixed 的浮层卡片（MenuSurface），
		   行高 34、圆角 var(--dsw-radius-md)、hover 用 interactive-bg-hover、字号 13/18 与 11/16。 */
		const css = [
			'.tm9a_root{min-width:0;position:relative;display:inline-flex}',
			/* 会话头里的胶囊：与官方 agent-team 触发器同规格 */
			'.tm9a_header{box-sizing:border-box;min-height:28px;max-width:min(320px,40cqw);color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:0;border-radius:6px;align-items:center;gap:5px;padding:3px 7px;font-size:12px;line-height:16px;display:inline-flex;min-width:0}',
			'.tm9a_header:hover,.tm9a_header:focus-visible{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover);outline:none}',
			'.tm9a_headerOpen{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}',
			/* composer 工具栏里的按钮：与官方模型位同规格 */
			'.tm9a_seat{box-sizing:border-box;min-width:0;max-width:min(360px,45cqw);height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;outline:none;border-radius:var(--dsw-radius-sm);align-items:center;gap:4px;padding:0 4px 0 8px;font-size:13px;font-weight:400;line-height:20px;display:flex}',
			'.tm9a_seat:hover:not(:disabled),.tm9a_seat:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}',
			'.tm9a_seatOpen{background:var(--dsw-alias-interactive-bg-hover)}',
			'.tm9a_label{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}',
			'.tm9a_value{text-overflow:ellipsis;white-space:nowrap;min-width:0;color:var(--dsw-alias-label-caption);flex-shrink:1000;overflow:hidden}',
			'.tm9a_count{color:var(--dsw-alias-label-caption);font-variant-numeric:tabular-nums;font-size:12px;font-weight:400;line-height:16px;flex:none}',
			'.tm9a_chevron{color:var(--dsw-alias-label-caption);flex:none;transition:transform .12s}',
			'.tm9a_chevronOpen{transform:rotate(180deg)}',
			/* 菜单卡片 */
			'.tm9a_menu{z-index:1100;--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);background:var(--dsw-specific-menu,var(--dsw-alias-bg-overlay));width:min(420px,100vw - 32px);max-height:min(440px,100vh - 96px);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-primary);border:0;border-radius:var(--dsw-radius-lg,12px);flex-direction:column;padding:4px;display:flex;position:fixed;overflow:hidden}',
			'.tm9a_head{flex:none;align-items:center;gap:6px;padding:5px 7px 6px;display:flex}',
			'.tm9a_headTitle{color:var(--dsw-alias-label-tertiary);flex:auto;min-width:0;text-overflow:ellipsis;white-space:nowrap;overflow:hidden;font-size:11px;line-height:16px}',
			'.tm9a_headModel{color:var(--dsw-alias-label-secondary);flex:none;font-size:11px;line-height:16px;font-variant-numeric:tabular-nums}',
			'.tm9a_body{flex:auto;min-height:0;overflow-y:auto}',
			/* 分组标题不吸顶：吸顶的半透明条会和滚动中的行叠在一起，看起来像文字重影。 */
			'.tm9a_menu [data-menu-group-heading]{position:static;background:0 0;padding:10px 8px 4px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}',
			'.tm9a_searchRow{flex:none;margin:2px 0 3px;position:relative}',
			'.tm9a_searchRow .tm9a_search{border-radius:var(--dsw-radius-md);background:0 0;border:0 solid #0000;height:auto;padding:5px 7px;display:flex}',
			'.tm9a_searchRow .tm9a_search:focus-within{border-color:#0000;outline:none;box-shadow:none}',
			'.tm9a_searchRow .tm9a_search.tm9a_searchWithQuery{padding-right:34px}',
			'.tm9a_searchRow .tm9a_search input{padding:0;font-size:12px;line-height:normal;background:0 0;border:0;outline:none}',
			'.tm9a_searchRow .tm9a_search input::placeholder{color:var(--dsw-alias-label-caption)}',
			'.tm9a_searchClear{corner-shape:round;width:24px;height:24px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:50%;justify-content:center;align-items:center;padding:0;display:inline-flex;position:absolute;top:50%;right:4px;transform:translateY(-50%)}',
			'.tm9a_searchClear:hover,.tm9a_searchClear:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}',
			'.tm9a_searchClear svg{width:14px;height:14px}',
			'.tm9a_row{box-sizing:border-box;flex:none;width:auto;min-width:100%;min-height:34px;color:inherit;text-align:left;cursor:pointer;background:0 0;border:none;outline:none;border-radius:var(--dsw-radius-md);align-items:center;gap:6px;padding:5px 7px;display:flex}',
			'.tm9a_row:hover:not(:disabled),.tm9a_row:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}',
			'.tm9a_row:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}',
			'.tm9a_rowCopy{flex-direction:column;flex:1;min-width:0;display:flex}',
			'.tm9a_rowName{color:inherit;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:400;line-height:18px;overflow:hidden}',
			'.tm9a_rowMeta{color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;font-size:11px;line-height:16px;overflow:hidden}',
			'.tm9a_check{color:var(--dsw-alias-label-primary);flex:0 0 14px;place-items:center;display:grid}',
			'.tm9a_check svg{width:14px;height:14px}',
			'.tm9a_mark{flex:none;align-items:center;display:inline-flex}',
			'.tm9a_chev{width:12px;height:12px;color:var(--dsw-alias-label-caption);flex:none}',
			'.tm9a_tag{flex:none;color:var(--dsw-alias-label-caption);background:var(--dsw-alias-bg-layer-2);border-radius:4px;padding:0 4px;font-size:10px;line-height:15px}',
			'.tm9a_error{border-radius:var(--dsw-radius-md);background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);justify-content:space-between;align-items:flex-start;gap:6px;margin-bottom:3px;padding:6px 7px;font-size:11px;line-height:16px;display:flex}',
			'.tm9a_retry{color:inherit;font:inherit;cursor:pointer;background:0 0;border:none;flex:none;padding:0;font-weight:600}',
			'.tm9a_empty{color:var(--dsw-alias-label-tertiary);padding:8px;font-size:12px;line-height:18px}',
			'.tm9a_notice{color:var(--dsw-alias-label-warn,var(--dsw-alias-state-warn-primary));padding:2px 7px 6px;font-size:11px;line-height:16px}',
			'.tm9a_seat{flex:0 0 auto;white-space:nowrap;max-width:min(220px,38cqw)}',
			'.tm9a_glyph{color:var(--dsw-alias-label-tertiary);flex:none;width:13px;height:13px}',
			'.tm9a_glyphText{color:var(--dsw-alias-label-tertiary);flex:none;font-size:12px}',
			'.tm9a_seat .tm9a_value{color:var(--dsw-alias-label-secondary)}',
			'@container (max-width:720px){.tm9a_seat .tm9a_label{display:none}}',
			'@media (max-width:760px){.tm9a_seat .tm9a_label{display:none}.tm9a_seat{max-width:150px}}',
			'@media (max-width:560px){.tm9a_seat{max-width:112px;padding:0 2px 0 6px}}',
			/* 设置页 */
			'.tm9a_page{flex-direction:column;gap:14px;padding:2px 2px 28px;display:flex}',
			'.tm9a_pageHead{flex-direction:column;gap:4px;display:flex}',
			'.tm9a_pageTitle{color:var(--dsw-alias-label-primary);margin:0;font-size:15px;font-weight:600;line-height:22px}',
			'.tm9a_pageDesc{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:18px}',
			'.tm9a_pageError{background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);border-radius:var(--dsw-radius-md);padding:7px 9px;font-size:12px;line-height:18px}',
			'.tm9a_pageNotice{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
			'.tm9a_pageEmpty{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
			'.tm9a_card{background:var(--dsw-alias-bg-layer-2);border-radius:10px;box-shadow:var(--dsw-elevation-stroke);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);flex-direction:column;gap:2px;padding:10px 12px;display:flex}',
			'.tm9a_cardHead{align-items:center;gap:8px;padding-bottom:4px;display:flex}',
			'.tm9a_cardTitle{color:var(--dsw-alias-label-primary);min-width:0;font-size:13px;font-weight:500;line-height:20px;text-overflow:ellipsis;white-space:nowrap;overflow:hidden}',
			'.tm9a_cardCount{color:var(--dsw-alias-label-caption);flex:none;font-size:11px;font-variant-numeric:tabular-nums;line-height:16px}',
			'.tm9a_link{color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:0;border-radius:6px;flex:none;margin-left:auto;padding:3px 7px;font-size:12px;line-height:16px}',
			'.tm9a_link:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
			'.tm9a_setRow{align-items:center;gap:8px;min-height:36px;display:flex}',
			'.tm9a_setCopy{flex-direction:column;gap:1px;min-width:0;flex:auto;display:flex}',
			'.tm9a_setName{color:var(--dsw-alias-label-primary);font-size:13px;line-height:18px;text-overflow:ellipsis;white-space:nowrap;overflow:hidden}',
			'.tm9a_setModel{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;text-overflow:ellipsis;white-space:nowrap;overflow:hidden}',
			'.tm9a_picker{flex-direction:column;gap:8px;padding:2px 2px 8px;display:flex}',
			'.tm9a_group{flex-direction:column;gap:4px;display:flex}',
			'.tm9a_groupLabel{color:var(--dsw-alias-label-caption);padding:2px;font-size:11px;line-height:16px}',
			'.tm9a_chips{flex-wrap:wrap;gap:6px;display:flex}',
			'.tm9a_chip{background:0 0;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;color:var(--dsw-alias-label-secondary);cursor:pointer;max-width:100%;height:26px;padding:0 9px;font-size:12px;line-height:16px;text-overflow:ellipsis;white-space:nowrap;overflow:hidden}',
			'.tm9a_chip:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
			'.tm9a_foot{flex:none;color:var(--dsw-alias-label-caption);border-top:.5px solid var(--dsw-alias-border-l1);margin-top:2px;padding:6px 7px 2px;font-size:11px;line-height:16px}'
		].join('');

		if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(CSS_ID) + ']') === null) {
			const tag = document.createElement('style');
			tag.dataset.plugin = 'dsh-team-model';
			tag.dataset.pluginCss = CSS_ID;
			tag.textContent = css;
			document.head.appendChild(tag);
		}

		const h = React.createElement;
		const MEASURE_STYLE = { visibility: 'hidden', left: 0, top: 0 };

		/** 'vendor/model-name' -> 'model-name'（只去掉冗余的厂商前缀，供窄处展示）。 */
		function bareModel(model) {
			const text = String(model ?? '');
			const cut = text.lastIndexOf('/');
			return cut === -1 ? text : text.slice(cut + 1);
		}

		function providerName(groups, id) {
			if (typeof id !== 'string' || id === '') return '';
			for (const group of Array.isArray(groups) ? groups : []) {
				if (group?.id === id) return String(group.name ?? id);
			}
			return id;
		}

		function routeText(groups, member) {
			if (member === undefined || member.model === undefined || member.model === null) return '跟随会话默认';
			const provider = providerName(groups, member.providerId);
			const base = provider === '' ? bareModel(member.model) : provider + ' · ' + bareModel(member.model);
			const effort = effortLabel(member.reasoningEffort);
			return effort === '' ? base : base + ' · ' + effort;
		}

		function sameRoute(member, providerId, modelId) {
			return member !== undefined && member.providerId === providerId && member.model === modelId;
		}

		/** 推理强度：'max' -> 'Max'，未知值原样返回。 */
		function effortLabel(effortId) {
			if (typeof effortId !== 'string' || effortId === '') return '';
			return effortId.slice(0, 1).toUpperCase() + effortId.slice(1);
		}

		function effortsOf(model) {
			const efforts = model?.reasoning?.efforts;
			return Array.isArray(efforts) ? efforts.filter((effort) => typeof effort?.id === 'string') : [];
		}

		function statusDotOf(member) {
			if (member?.live === true) return h(primitives.StateDot, { state: 'ongoing' });
			return null;
		}

		/** 菜单里的单选行：模型行与推理强度行共用（右侧可带一小段说明，例如当前的 Max）。 */
		function pickRow(options) {
			const { key, name, trailing, selected, pending, onPick, disabled } = options;
			return h('button', {
				key,
				type: 'button',
				role: 'menuitemradio',
				'aria-checked': selected === true,
				className: selected === true ? 'tm9a_row tm9a_modelRow tm9a_rowActive' : 'tm9a_row tm9a_modelRow',
				disabled: disabled === true,
				title: name,
				onClick: onPick,
				children: [
					h('span', { key: 'copy', className: 'tm9a_rowCopy' }, [
						h('span', { key: 'n', className: 'tm9a_rowName' }, name)
					]),
					trailing === undefined || trailing === ''
						? null
						: h('span', { key: 'trail', className: 'tm9a_rowMeta', style: { flex: 'none', maxWidth: '45%' } }, trailing),
					h('span', { key: 'check', className: 'tm9a_check' },
						pending === true
							? h(primitives.StateDot, { state: 'ongoing' })
							: selected === true
								? h(primitives.IconCheckOutlineRegular, {})
								: null)
				]
			});
		}

		function TeamModelAction(props) {
			const readSession = typeof props.useSession === 'function' ? props.useSession : undefined;
			const parentId = readSession === undefined ? undefined : readSession((snapshot) => snapshot?.subagent?.address?.parentSessionId);
			const rawSessionId = typeof props.sessionId === 'string' ? props.sessionId : undefined;
			const sessionId = typeof parentId === 'string' && parentId !== '' ? parentId : rawSessionId;
			const compact = props.compact === true;
			/* 队友自己的会话里：只有"这个队友"可改，不再列整支团队。 */
			const childMode = typeof parentId === 'string' && parentId !== '';
			const label = childMode ? '模型' : '队友模型';

			const [open, setOpen] = React.useState(false);
			const [pane, setPane] = React.useState('team');
			const [targetId, setTargetId] = React.useState(undefined);
			const [data, setData] = React.useState(null);
			const [error, setError] = React.useState(null);
			const [busy, setBusy] = React.useState(false);
			const [query, setQuery] = React.useState('');
			const [menuPos, setMenuPos] = React.useState(null);
			/* 非错误性质的提示（例如"该队员不在线，已记下"），与红色错误条分开。 */
			const [notice, setNotice] = React.useState(null);

			const rootRef = React.useRef(null);
			const menuRef = React.useRef(null);
			const triggerRef = React.useRef(null);
			const searchRef = React.useRef(null);

			const call = React.useCallback((endpoint, payload) => {
				return props.ctx.connection.rpc.call(CHANNEL, endpoint, payload).then((reply) => {
					if (reply?.ok === true) return reply.value;
					throw new Error(String(reply?.error?.message ?? reply?.error ?? 'rpc failed'));
				});
			}, [props.ctx]);

			const load = React.useCallback(() => {
				if (sessionId === undefined) {
					setError('当前会话没有 id，无法读取队员模型');
					return Promise.resolve();
				}
				setBusy(true);
				setError(null);
				/* sessionId 用来定位"当前这段话属于谁"（队友会话里是自己的子会话 id），
				   leadSessionId 用来找到团队名单。 */
				return call('tm.state', { sessionId: rawSessionId ?? sessionId, leadSessionId: sessionId })
					.then((value) => {
						setData(value);
						const members = Array.isArray(value?.members) ? value.members : [];
						setTargetId((current) => {
							if (current !== undefined && members.some((member) => member.id === current)) return current;
							/* 在队友自己的会话里打开时，默认聚焦"这个队友"，而不是 Lead。 */
							const self = rawSessionId === undefined ? undefined : members.find((member) => member.id === rawSessionId);
							const lead = members.find((member) => member.role === 'lead');
							return (self ?? lead ?? members[0])?.id;
						});
					})
					.catch((failure) => setError(String(failure?.message ?? failure)))
					.finally(() => setBusy(false));
			}, [call, sessionId, rawSessionId]);

			/* 组件一挂载就取一次状态：composer 那格要立刻显示当前模型，
			   而不是等用户点开菜单才从 RPC 拿数据。 */
			React.useEffect(() => {
				void load();
			}, [load]);

			React.useEffect(() => {
				if (!open) return undefined;
				const closeOutside = (event) => {
					if (rootRef.current?.contains(event.target) === true) return;
					if (menuRef.current?.contains(event.target) === true) return;
					setOpen(false);
				};
				const onKey = (event) => {
					if (event.key === 'Escape') {
						event.stopPropagation();
						setOpen(false);
						triggerRef.current?.focus();
					}
				};
				document.addEventListener('mousedown', closeOutside);
				document.addEventListener('keydown', onKey);
				return () => {
					document.removeEventListener('mousedown', closeOutside);
					document.removeEventListener('keydown', onKey);
				};
			}, [open]);

			/* 定位：照官方 ModelSelect 的做法——先以 measure 样式渲染量出尺寸，再夹进视口。 */
			React.useLayoutEffect(() => {
				if (!open) {
					setMenuPos(null);
					return undefined;
				}
				const place = () => {
					const rect = triggerRef.current?.getBoundingClientRect();
					if (rect === undefined) return;
					const MARGIN = 12;
					const width = menuRef.current?.offsetWidth ?? 0;
					const height = menuRef.current?.offsetHeight ?? 0;
					let left = width > 0 ? rect.right - width : rect.left;
					/* 右对齐会把左边界推出视口时，改成与触发器左沿对齐，菜单才贴着按钮而不是飞到屏幕另一头。 */
					if (width > 0 && rect.right - width < MARGIN) left = rect.left;
					let top = rect.top - 8 - height;
					if (height > 0 && rect.top - 8 - height < MARGIN) top = rect.bottom + 8;
					if (width > 0) left = Math.min(Math.max(left, MARGIN), window.innerWidth - width - MARGIN);
					if (height > 0) top = Math.min(Math.max(top, MARGIN), window.innerHeight - height - MARGIN);
					setMenuPos({ left, top });
				};
				place();
				window.addEventListener('scroll', place, true);
				window.addEventListener('resize', place);
				const node = menuRef.current;
				const observer = typeof ResizeObserver === 'undefined' || node === null ? null : new ResizeObserver(place);
				observer?.observe(node);
				return () => {
					observer?.disconnect();
					window.removeEventListener('scroll', place, true);
					window.removeEventListener('resize', place);
				};
			}, [open, pane, data, query]);

			React.useEffect(() => {
				if (open && pane === 'models' && query !== '') searchRef.current?.focus();
			}, [open, pane, query]);

			const members = Array.isArray(data?.members) ? data.members : [];
			const groups = Array.isArray(data?.catalog?.groups) ? data.catalog.groups : [];
			const target = members.find((member) => member.id === targetId);
			const lead = members.find((member) => member.role === 'lead');
			const multi = members.length > 1;
			const teammates = members.filter((member) => member.role === 'teammate');
			/* 当前聚焦成员的模型、以及这个模型支持的推理强度（目录里每个模型带 reasoning.efforts）。 */
			const currentModel = (() => {
				const group = groups.find((entry) => entry.id === target?.providerId);
				return group?.models?.find((entry) => entry.id === target?.model);
			})();
			const effortList = effortsOf(currentModel);
			const effortNow = target?.reasoningEffort ?? currentModel?.reasoning?.defaultEffort;
			/* composer 那格的空间只够一个短语：优先显示"正在关注的那个队友"的模型，
			   否则显示队友数量，避免和左侧内置模型位撞成一样的文字。 */
			const seatValue = (() => {
				if (childMode) return target === undefined ? '…' : bareModel(target.model);
				if (target !== undefined && target.role === 'teammate') return bareModel(target.model);
				if (teammates.length === 1) return bareModel(teammates[0].model);
				if (teammates.length === 0) return '无队友';
				return String(teammates.length) + ' 位队友';
			})();

			const show = () => {
				const next = !open;
				setOpen(next);
				setQuery('');
				setNotice(null);
				if (next) {
					setPane(childMode ? 'models' : multi || data === null ? 'team' : 'models');
					void load();
				}
			};

			const pickModel = (group, model, effortId) => {
				const memberId = target?.id ?? targetId ?? sessionId;
				if (memberId === undefined) return;
				const effort = effortId ?? model?.reasoning?.defaultEffort;
				setBusy(true);
				setError(null);
				setNotice(null);
				const payload = {
					sessionId: memberId,
					provider: group.id,
					model: model.id,
					...(effort === undefined ? {} : { reasoningEffort: effort })
				};
				call('tm.setModel', payload)
					.then((result) => {
						setData((current) => {
							if (current === null) return current;
							return {
								...current,
								members: current.members.map((member) => member.id === memberId
									? { ...member, providerId: payload.provider, model: payload.model, reasoningEffort: payload.reasoningEffort, live: member.live }
									: member)
							};
						});
						if (result?.queued === true) {
							setNotice('该队员当前不在线，模型已记下，下次启动时生效');
							return;
						}
						setPendingModel(null);
						setOpen(false);
					})
					.catch((failure) => setError(String(failure?.message ?? failure)))
					.finally(() => setBusy(false));
			};

			const followLead = () => {
				if (lead === undefined || target === undefined || lead.id === target.id) return;
				const group = groups.find((entry) => entry.id === lead.providerId);
				const model = group?.models?.find((entry) => entry.id === lead.model);
				if (group === undefined || model === undefined) return;
				pickModel(group, model);
			};

			const trigger = compact
				? h('button', {
					ref: triggerRef,
					type: 'button',
					className: open ? 'tm9a_seat tm9a_seatOpen' : 'tm9a_seat',
					'aria-haspopup': 'dialog',
					'aria-expanded': open,
					title: label,
					onClick: show,
					children: [
						/* 窄了以后长标签会把整行挤到第二行：队友会话里只留「模型」两个字，
						   Lead 那边用图标 + 队友数/模型名，宽度稳定。 */
						childMode
							? h('span', { key: 'glyph', className: 'tm9a_glyphText' }, '模型')
							: typeof primitives.IconUsersOutlineRegular === 'function'
								? h(primitives.IconUsersOutlineRegular, { key: 'glyph', className: 'tm9a_glyph' })
								: h('span', { key: 'glyph', className: 'tm9a_glyphText' }, '队友'),
						h('span', { key: 'value', className: 'tm9a_value' }, seatValue),
						h(primitives.IconChevronDownOutlineRegular, {
							key: 'chevron',
							className: open ? 'tm9a_chevron tm9a_chevronOpen' : 'tm9a_chevron'
						})
					]
				})
				: h('button', {
					ref: triggerRef,
					type: 'button',
					className: open ? 'tm9a_header tm9a_headerOpen' : 'tm9a_header',
					'aria-haspopup': 'dialog',
					'aria-expanded': open,
					title: label,
					onClick: show,
					children: [
						h('span', { key: 'label', className: 'tm9a_label' }, label),
						childMode
							? h('span', { key: 'value', className: 'tm9a_value' }, seatValue)
							: teammates.length > 0
								? h('span', { key: 'count', className: 'tm9a_count' }, String(teammates.length))
								: null,
						h(primitives.IconChevronDownOutlineRegular, {
							key: 'chevron',
							className: open ? 'tm9a_chevron tm9a_chevronOpen' : 'tm9a_chevron'
						})
					]
				});

			let content = null;
			if (open) {
				const body = [];

				if (notice !== null) {
					body.push(h('div', { key: 'notice', className: 'tm9a_notice' }, notice));
				}

				if (error !== null) {
					body.push(h('div', { key: 'error', className: 'tm9a_error' }, [
						h('span', { key: 'msg' }, error),
						h('button', { key: 'retry', type: 'button', className: 'tm9a_retry', onClick: () => void load() }, '重试')
					]));
				}

				if (pane === 'team') {
					body.push(h('div', { key: 'head', className: 'tm9a_head' }, [
						h('span', { className: 'tm9a_headTitle' }, '选择要设置模型的成员')
					]));
					const list = members.map((member) => h('button', {
						key: member.id,
						type: 'button',
						className: 'tm9a_row',
						onClick: () => {
							setTargetId(member.id);
							setPane('models');
						},
						children: [
							h('span', { key: 'dot', className: 'tm9a_mark' }, statusDotOf(member)),
							h('span', { key: 'copy', className: 'tm9a_rowCopy' }, [
								h('span', { key: 'n', className: 'tm9a_rowName' }, [
									member.name === '' || member.name === undefined ? '当前会话' : member.name,
									member.role === 'lead' ? h('span', { key: 'tag', className: 'tm9a_tag', style: { marginLeft: 6 } }, 'Lead') : null
								]),
								h('span', { key: 'm', className: 'tm9a_rowMeta' }, routeText(groups, member))
							]),
							h(primitives.IconChevronRightOutlineRegular, { key: 'chev', className: 'tm9a_chev' })
						]
					}));
					body.push(h('div', { key: 'list', className: 'tm9a_body' }, list.length === 0
						? h('div', { className: 'tm9a_empty' }, busy ? '读取中…' : '这个会话还没有队友')
						: list));
				} else if (pane === 'effort') {
					body.push(h('div', { key: 'head', className: 'tm9a_head' }, [
						h('button', {
							type: 'button',
							className: 'tm9a_row',
							style: { minHeight: 24, width: 'auto', flex: 'none', padding: '2px 6px', gap: 4 },
							onClick: () => setPane('models'),
							children: [
								h(primitives.IconChevronRightOutlineRegular, { className: 'tm9a_chev', style: { transform: 'rotate(180deg)' } }),
								h('span', { className: 'tm9a_headTitle', style: { color: 'inherit' } }, '推理强度')
							]
						}),
						h('span', { key: 'model', className: 'tm9a_headModel' },
							currentModel === undefined ? '' : String(currentModel.name ?? bareModel(currentModel.id)))
					]));
					const effortRows = effortList.map((effort) => pickRow({
						key: 'effort/' + effort.id,
						name: String(effort.name ?? effortLabel(effort.id)),
						selected: effortNow === effort.id,
						pending: false,
						disabled: busy,
						onPick: () => pickModel(
							groups.find((entry) => entry.id === target?.providerId) ?? { id: target?.providerId, models: [] },
							{ id: target?.model, reasoning: { defaultEffort: effort.id } },
							effort.id
						)
					}));
					body.push(h('div', { key: 'efforts', className: 'tm9a_body', role: 'group' }, effortRows.length === 0
						? h('div', { className: 'tm9a_empty' }, '这个模型不支持调节推理强度')
						: effortRows));
				} else {
					body.push(h('div', { key: 'head', className: 'tm9a_head' }, [
						multi && !childMode
							? h('button', {
								type: 'button',
								className: 'tm9a_row',
								style: { minHeight: 24, width: 'auto', flex: 'none', padding: '2px 6px', gap: 4 },
								onClick: () => {
									setPane('team');
									setQuery('');
								},
								children: [
									h(primitives.IconChevronRightOutlineRegular, { className: 'tm9a_chev', style: { transform: 'rotate(180deg)' } }),
									h('span', { className: 'tm9a_headTitle', style: { color: 'inherit' } },
										target?.name === undefined || target.name === '' ? '返回' : target.name)
								]
							})
							: h('span', { className: 'tm9a_headTitle' }, target?.name === undefined || target.name === '' ? '当前会话' : target.name),
						h('span', { key: 'current', className: 'tm9a_headModel' }, routeText(groups, target))
					]));

					const models = groups.flatMap((group) => (Array.isArray(group.models) ? group.models : []).map((model) => ({
						group,
						model
					})));
					const showSearch = models.length > 4;
					const rank = typeof primitives.rankByName === 'function' ? primitives.rankByName : (list) => list;
					const needle = showSearch ? query.trim() : '';

					if (showSearch) {
						body.push(h('div', { key: 'search', className: 'tm9a_searchRow' }, [
							h(primitives.Input, {
								key: 'input',
								ref: searchRef,
								className: query === '' ? 'tm9a_search' : 'tm9a_search tm9a_searchWithQuery',
								type: 'text',
								role: 'searchbox',
								placeholder: '搜索模型…',
								value: query,
								onChange: (event) => setQuery(event.target.value)
							}),
							query === ''
								? null
								: h('button', {
									key: 'clear',
									type: 'button',
									className: 'tm9a_searchClear',
									'aria-label': '清空搜索',
									onClick: () => {
										setQuery('');
										searchRef.current?.focus();
									},
									children: typeof primitives.IconCloseOutlineRegular === 'function'
										? h(primitives.IconCloseOutlineRegular, { key: 'i' })
										: h('span', { key: 'i' }, '×')
								})
						]));
					}

					const listChildren = [];

					/* 推理强度和模型分开一层：与官方「模型 / 推理等级」两格一致，改强度不必重选模型。 */
					if (effortList.length > 0) {
						listChildren.push(h('button', {
							key: 'effort',
							type: 'button',
							className: 'tm9a_row',
							disabled: busy,
							onClick: () => setPane('effort'),
							children: [
								h('span', { key: 'copy', className: 'tm9a_rowCopy' }, [
									h('span', { key: 'n', className: 'tm9a_rowName' }, '推理强度')
								]),
								h('span', { key: 'v', className: 'tm9a_rowMeta', style: { flex: 'none' } }, effortLabel(effortNow ?? '') || '默认'),
								h(primitives.IconChevronRightOutlineRegular, { key: 'chev', className: 'tm9a_chev' })
							]
						}));
					}

					if (target !== undefined && lead !== undefined && lead.id !== target.id) {
						listChildren.push(h('button', {
							key: 'follow',
							type: 'button',
							className: 'tm9a_row',
							onClick: followLead,
							children: [
								h('span', { key: 'copy', className: 'tm9a_rowCopy' }, [
									h('span', { key: 'n', className: 'tm9a_rowName' }, '与 Lead 使用同一模型'),
									h('span', { key: 'm', className: 'tm9a_rowMeta' }, routeText(groups, lead))
								]),
								sameRoute(target, lead.providerId, lead.model) === true
									? h('span', { key: 'check', className: 'tm9a_check' }, h(primitives.IconCheckOutlineRegular, {}))
									: null
							]
						}));
					}

					const sections = groups.map((group) => {
						const list = rank(Array.isArray(group.models) ? group.models : [], needle);
						if (list.length === 0) return null;
						return h(primitives.MenuGroup, { key: group.id, label: String(group.name ?? group.id) },
							list.map((model) => pickRow({
								key: group.id + '/' + model.id,
								name: String(model.name ?? bareModel(model.id)),
								trailing: sameRoute(target, group.id, model.id) === true ? effortLabel(effortNow ?? '') : '',
								selected: sameRoute(target, group.id, model.id),
								pending: false,
								disabled: busy,
								/* 重新点中当前模型时保留已选强度，只有换模型才回到该模型的默认强度。 */
								onPick: () => pickModel(group, model, sameRoute(target, group.id, model.id) ? effortNow : undefined)
							})));
					});

					for (const section of sections) {
						if (section !== null) listChildren.push(section);
					}

					body.push(h('div', { key: 'list', className: 'tm9a_body', role: 'group' },
						listChildren.length === 0
							? h('div', { className: 'tm9a_empty' }, busy ? '读取中…' : needle === '' ? '没有可用的模型' : '没有匹配的模型')
							: listChildren));

					if (data?.problem === 'lead session is not live') {
						body.push(h('div', { key: 'notice', className: 'tm9a_notice' },
							'Lead 会话当前不在线，这里只显示这个会话自己的模型。'));
					}
				}

				content = ReactDOM.createPortal(h(primitives.MenuSurface, {
					ref: menuRef,
					className: 'tm9a_menu',
					style: menuPos ?? MEASURE_STYLE,
					role: 'dialog',
					'aria-label': label,
					'aria-busy': busy,
					children: body
				}), document.body);
			}

			return h('span', { ref: rootRef, className: 'tm9a_root' }, trigger, content);
		}

		/** 设置 → 队友模型：一次列出所有团队的队友，可逐个改，也可整队/全部统一。 */
		function TeamModelSettings(props) {
			const ctx = props.ctx;
			const [data, setData] = React.useState(null);
			const [busy, setBusy] = React.useState(false);
			const [error, setError] = React.useState(null);
			const [notice, setNotice] = React.useState(null);
			const [openKey, setOpenKey] = React.useState(null);

			const call = React.useCallback((endpoint, payload) => {
				return ctx.connection.rpc.call(CHANNEL, endpoint, payload).then((reply) => {
					if (reply?.ok === true) return reply.value;
					throw new Error(String(reply?.error?.message ?? reply?.error ?? 'rpc failed'));
				});
			}, [ctx]);

			const load = React.useCallback(() => {
				setBusy(true);
				return call('tm.globals', {})
					.then((value) => {
						setData(value);
						setError(null);
					})
					.catch((failure) => setError(String(failure?.message ?? failure)))
					.finally(() => setBusy(false));
			}, [call]);

			React.useEffect(() => {
				void load();
			}, [load]);

			const groups = Array.isArray(data?.catalog?.groups) ? data.catalog.groups : [];
			const teams = Array.isArray(data?.teams) ? data.teams : [];

			/* targets=null 表示"全部队友"；否则只改这几个 session。 */
			const apply = (targets, group, model) => {
				setBusy(true);
				setError(null);
				setNotice(null);
				const effort = model?.reasoning?.defaultEffort;
				const payload = {
					provider: group.id,
					model: model.id,
					...(effort === undefined ? {} : { reasoningEffort: effort }),
					...(targets === null ? {} : { sessionIds: targets })
				};
				return call('tm.setAll', payload)
					.then((result) => {
						const applied = Number(result?.applied ?? 0);
						const queuedCount = Number(result?.queued ?? 0);
						const failures = Array.isArray(result?.failures) ? result.failures : [];
						setNotice(
							queuedCount > 0
								? `已更新 ${applied} 位队友；${queuedCount} 位当前不在线，下次启动时生效`
								: `已更新 ${applied} 位队友`
						);
						if (failures.length > 0) setError(`${failures.length} 位更新失败：${String(failures[0]?.message ?? '')}`);
						setOpenKey(null);
						return load();
					})
					.catch((failure) => setError(String(failure?.message ?? failure)))
					.finally(() => setBusy(false));
			};

			const picker = (targets, key) => h('div', { key: 'picker-' + String(key), className: 'tm9a_picker' },
				groups.map((group) => {
					const models = Array.isArray(group.models) ? group.models : [];
					if (models.length === 0) return null;
					return h('div', { key: group.id, className: 'tm9a_group' }, [
						h('div', { key: 'label', className: 'tm9a_groupLabel' }, String(group.name ?? group.id)),
						h('div', { key: 'chips', className: 'tm9a_chips' }, models.map((model) => h('button', {
							key: model.id,
							type: 'button',
							className: 'tm9a_chip',
							disabled: busy,
							onClick: () => apply(targets, group, model),
							children: String(model.name ?? bareModel(model.id))
						})))
					]);
				})
			);

			const cards = teams.map((team) => {
				const children = [h('div', { key: 'head', className: 'tm9a_cardHead' }, [
					h('span', {
						key: 'title',
						className: 'tm9a_cardTitle',
						title: String(team.leadId ?? ''),
						children: team.leadTitle === undefined || team.leadTitle === null || team.leadTitle === ''
							? 'Lead · ' + String(team.leadName)
							: String(team.leadTitle)
					}),
					h('span', { key: 'count', className: 'tm9a_cardCount' }, String(team.members.length) + ' 位队友'),
					h('button', {
						key: 'bulk',
						type: 'button',
						className: 'tm9a_link',
						disabled: busy || team.members.length === 0,
						onClick: () => setOpenKey(openKey === team.leadId ? null : team.leadId),
						children: '整队统一'
					})
				])];
				if (openKey === team.leadId) {
					children.push(picker(team.members.map((member) => member.id), 'team-' + team.leadId));
				}
				for (const member of team.members) {
					children.push(h('div', { key: member.id, className: 'tm9a_setRow' }, [
						h('div', { key: 'copy', className: 'tm9a_setCopy' }, [
							h('span', { key: 'name', className: 'tm9a_setName' }, String(member.name ?? '')),
							h('span', { key: 'model', className: 'tm9a_setModel' },
								routeText(groups, member) + (member.live === true ? '' : ' · 离线'))
						]),
						h('button', {
							key: 'edit',
							type: 'button',
							className: 'tm9a_link',
							disabled: busy,
							onClick: () => setOpenKey(openKey === member.id ? null : member.id),
							children: '更改'
						})
					]));
					if (openKey === member.id) children.push(picker([member.id], member.id));
				}
				return h('section', { key: team.leadId, className: 'tm9a_card' }, children);
			});

			return h('div', { className: 'tm9a_page' }, [
				h('header', { key: 'head', className: 'tm9a_pageHead' }, [
					h('h2', { key: 'title', className: 'tm9a_pageTitle' }, '队友模型'),
					h('p', { key: 'desc', className: 'tm9a_pageDesc' },
						'设置 Agent Team 队友使用的模型。改动立即生效：在线的队友下一轮回复就用新模型，离线的队友在下次启动时生效。推理强度可以在会话内的模型菜单里单独调整。')
				]),
				error === null ? null : h('div', { key: 'error', className: 'tm9a_pageError' }, error),
				notice === null ? null : h('div', { key: 'notice', className: 'tm9a_pageNotice' }, notice),
				teams.length === 0
					? h('div', { key: 'empty', className: 'tm9a_pageEmpty' }, busy ? '读取中…' : '当前没有在线的 Agent Team。先在会话里创建队友，再回到这里统一设置。')
					: null,
				...cards
			]);
		}

		return {
			name: 'dsh-team-model',
			inject: ['slots', 'connection'],
			apply(ctx) {
				/* slot 组件拿不到 ctx，注册时把插件 ctx 作为 prop 注入，RPC 与 shim 都从它走。 */
				const register = (slot, id, order, compact) => {
					ctx.slots.inject(slot, () => ctx.slots.register({ name: slot, id, order }, (props) =>
						h(TeamModelAction, { ...props, ctx, compact })));
				};
				register('conversation.session.header.actions', 'team-model', 5, false);
				register('conversation.input.right', 'team-model', 0, true);
				/* 设置 → 队友模型：全局改队友模型的地方。 */
				ctx.slots.inject('settings.section', () => ctx.slots.register({
					name: 'settings.section',
					id: 'team-model',
					order: 45,
					label: '队友模型'
				}, (props) => h(TeamModelSettings, { ...props, ctx })));
			}
		};
	}
});
