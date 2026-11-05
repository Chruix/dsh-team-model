/* 冒烟测试：用最小 React/primitives 替身把 dsh-team-model 的客户端组件渲染多次。
   只验证"不抛异常 + 关键分支走到"，不验证像素。 */
const fs = require('node:fs');
const path = require('node:path');

const SRC = process.argv[2] ?? path.join(__dirname, '..', 'client.js');
const code = fs.readFileSync(SRC, 'utf8');

/* ---------- 最小 DOM ---------- */
const listeners = new Map();
const documentStub = {
	createElement() { return { dataset: {}, style: {}, setAttribute() {}, appendChild() {}, textContent: '' }; },
	head: { appendChild() {} },
	body: { appendChild() {}, contains: () => false },
	addEventListener(type, fn) { listeners.set('doc:' + type, fn); },
	removeEventListener(type) { listeners.delete('doc:' + type); },
	querySelector() { return null; },
	getElementById() { return null; },
};
const windowStub = {
	innerWidth: 1512,
	innerHeight: 900,
	addEventListener(type, fn) { listeners.set('win:' + type, fn); },
	removeEventListener(type) { listeners.delete('win:' + type); },
	document: documentStub,
};

/* ---------- 最小 React ---------- */
let stateOverrides = [];
let stateCursor = 0;
const stateStore = new Map();
let hookIndex = 0;

function useState(initial) {
	const index = hookIndex++;
	if (stateCursor < stateOverrides.length) {
		const forced = stateOverrides[stateCursor++];
		stateStore.set(index, forced);
		return [forced, (next) => { stateStore.set(index, typeof next === 'function' ? next(stateStore.get(index)) : next); }];
	}
	if (!stateStore.has(index)) stateStore.set(index, initial);
	return [stateStore.get(index), (next) => { stateStore.set(index, typeof next === 'function' ? next(stateStore.get(index)) : next); }];
}

const React = {
	createElement(tag, props, ...children) {
		const raw = children.length > 0 ? children : (props?.children !== undefined ? [props.children] : []);
		const flat = raw.flat(Infinity).filter((c) => c !== undefined && c !== null && c !== false);
		return { $$el: true, _fn: typeof tag === 'function' ? tag : undefined, type: typeof tag === 'string' ? tag : (tag?.name ?? 'Component'), props: { ...(props ?? {}), children: flat } };
	},
	useState,
	useRef(value) { return { current: value ?? null }; },
	useCallback(fn) { return fn; },
	useMemo(fn) { return fn(); },
	useEffect(fn) { try { fn(); } catch (e) { throw new Error('useEffect failed: ' + e.message); } },
	useLayoutEffect(fn) { try { fn(); } catch (e) { throw new Error('useLayoutEffect failed: ' + e.message); } },
	useId() { return 'id'; },
	Fragment: 'Fragment',
};
const ReactDOM = { createPortal(node) { return node; } };

const primitives = {
	MenuSurface: function MenuSurface() { return null; },
	MenuGroup: function MenuGroup() { return null; },
	MenuGroups: function MenuGroups() { return null; },
	MenuItemButton: function MenuItemButton() { return null; },
	Input: function Input(props) { return { $$el: true, type: 'input', props: { ...(props ?? {}) } }; },
	StateDot: function StateDot() { return null; },
	rankByName(items) { return items; },
	IconCheckOutlineRegular: function IconCheck() { return null; },
	IconChevronDownOutlineRegular: function IconChevronDown() { return null; },
	IconChevronRightOutlineRegular: function IconChevronRight() { return null; },
	IconUsersOutlineRegular: function IconUsers() { return null; },
	IconDataOutlineRegular: function IconData() { return null; },
};

/* ---------- 载入模块 ---------- */
let captured;
windowStub.__ModuleLoader__ = { load(definition) { captured = definition; } };
const requireStub = (id) => {
	if (id === 'react') return React;
	if (id === 'react-dom') return ReactDOM;
	if (id === '@deepseek-ai/dsh-client-ui-primitives') return primitives;
	throw new Error('unexpected require: ' + id);
};

new Function('window', 'document', 'require', 'console', code)(windowStub, documentStub, requireStub, console);
if (captured === undefined) throw new Error('module loader was not called');
const mod = captured.factory(requireStub);
if (captured.id !== 'dsh-team-model') throw new Error('bad module id: ' + captured.id);
if (typeof mod.apply !== 'function') throw new Error('module has no apply()');

/* ---------- 安装 ---------- */
const registrations = [];
const ctx = {
	connection: {
		rpc: {
			call: async (_channel, endpoint) => ({
				ok: true,
				value: endpoint === 'tm.globals' ? GLOBALS : endpoint === 'tm.setAll' ? { applied: 2, queued: 0, total: 2, failures: [] } : FAKE
			})
		}
	},
	slots: {
		inject(slotName, callback) { callback(); },
		register(spec, Component) { registrations.push({ spec, Component }); return () => {}; },
	},
};

const FAKE = {
	selfId: 'child-1',
	members: [
		{ id: 'lead-1', name: 'lead', role: 'lead', status: 'running', providerId: 'gateway', model: 'vendor/model-a', live: true },
		{ id: 'child-1', name: 'reviewer', role: 'teammate', status: 'inactive', providerId: 'ai-hub', model: 'model-b', live: false },
		{ id: 'child-2', name: 'tester', role: 'teammate', status: 'inactive', providerId: 'gateway', model: 'vendor/model-c', live: false },
	],
	catalog: {
		groups: [
			{ id: 'ai-hub', name: 'AI Hub', models: [
				{ id: 'model-b', name: 'Model B', description: 'Fast general purpose.', reasoning: { efforts: [{ id: 'off', name: 'Off' }, { id: 'low', name: 'Low' }, { id: 'high', name: 'High' }, { id: 'max', name: 'Max' }], defaultEffort: 'high' } },
				{ id: 'model-c', name: 'Model C' },
			] },
			{ id: 'acme', name: 'Acme', models: [
				{ id: 'model-a', name: 'Model A', description: 'Fast general purpose.' },
			] },
		],
	},
	defaults: { defaultProvider: 'gateway', defaultModel: 'vendor/model-a', freshProvider: 'spawn', forkProvider: 'fork' },
	leadId: 'lead-1',
	problem: null,
};

const GLOBALS = {
	teams: [
		{
			leadId: 'lead-1',
			leadName: 'lead',
			leadTitle: '修模型入口',
			members: [
				{ id: 'child-1', name: 'reviewer', role: 'teammate', status: 'inactive', providerId: 'ai-hub', model: 'model-b', live: false },
				{ id: 'child-2', name: 'tester', role: 'teammate', status: 'running', providerId: 'gateway', model: 'vendor/model-c', live: true }
			]
		}
	],
	catalog: FAKE.catalog,
	defaults: FAKE.defaults
};

mod.apply(ctx);
if (registrations.length !== 3) throw new Error('expected 3 slot registrations, got ' + registrations.length + ' (' + registrations.map((r) => r.spec?.name).join(',') + ')');

/* ---------- 渲染各状态 ---------- */
function render(reg, props, overrides) {
	hookIndex = 0;
	stateOverrides = overrides ?? [];
	stateCursor = 0;
	stateStore.clear();
	let out = reg.Component({ ...props, ctx });
	let guard = 0;
	while (out !== null && out !== undefined && out.$$el === true && typeof out._fn === 'function') {
		out = out._fn(out.props);
		if (++guard > 12) throw new Error('component chain did not settle');
	}
	if (out === undefined || out === null) throw new Error('component returned nothing');
	return out;
}

const headerReg = registrations.find((r) => r.spec?.id === 'team-model' && r.spec?.name === 'conversation.session.header.actions');
const seatReg = registrations.find((r) => r.spec?.name === 'conversation.input.right');
if (headerReg === undefined || seatReg === undefined) {
	throw new Error('slots: ' + registrations.map((r) => r.spec?.name).join(','));
}

const leadProps = { sessionId: 'lead-1', useSession: (sel) => sel({ subagent: undefined }) };
const BIG = JSON.parse(JSON.stringify(FAKE));
BIG.catalog.groups = [{ id: 'ai-hub', name: 'AI Hub', models: ['a1', 'a2', 'a3', 'a4', 'a5'].map((id) => ({ id, name: 'Model ' + id })) }];

const childProps = { sessionId: 'child-1', useSession: (sel) => sel({ subagent: { address: { parentSessionId: 'lead-1' } } }) };

render(headerReg, leadProps, []);                                                        // 关闭态
render(headerReg, leadProps, [true, 'team', undefined, FAKE, null, false, '', null]);     // 打开·团队窗格
render(headerReg, leadProps, [true, 'models', 'lead-1', FAKE, null, false, '', null]);    // 打开·模型窗格
render(headerReg, leadProps, [true, 'models', 'lead-1', FAKE, null, false, 'pro', null]);// 搜索词
render(headerReg, leadProps, [true, 'team', undefined, null, 'boom', false, '', null]);   // 错误态
render(headerReg, leadProps, [true, 'team', undefined, null, null, true, '', null]);      // 加载中
render(seatReg, leadProps, []);                                                          // composer·关闭
render(seatReg, leadProps, [true, 'team', undefined, FAKE, null, false, '', null]);       // composer·打开
render(seatReg, childProps, []);                                                         // 队友会话·关闭
render(seatReg, childProps, [true, 'models', 'child-1', FAKE, null, false, '', { left: 100, top: 200 }]); // 队友会话·打开
render(headerReg, childProps, []);                                                       // 队友会话·头部

/* ---------- 断言 ---------- */
const styleTagFound = true;
function collectText(node, out = []) {
	if (node === null || node === undefined || node === false) return out;
	if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out; }
	if (Array.isArray(node)) { for (const child of node) collectText(child, out); return out; }
	if (node.$$el === true) { collectText(node.props?.children, out); return out; }
	return out;
}
function walk(node, out = []) {
	if (node === null || node === undefined || node === false) return out;
	if (Array.isArray(node)) { for (const child of node) walk(child, out); return out; }
	if (node.$$el === true) { out.push(node); walk(node.props?.children, out); }
	return out;
}
function textOf(reg, props, overrides) {
	return collectText(render(reg, props, overrides)).join('|');
}
function assert(condition, message) {
	if (!condition) throw new Error('ASSERT FAILED: ' + message);
	console.log('ok  ' + message);
}

const childSeat = textOf(seatReg, childProps, []);
assert(childSeat.includes('模型'), 'child seat shows 模型: ' + childSeat);
assert(!childSeat.includes('队友模型'), 'child seat does not say 队友模型');
const childSeatLoaded = textOf(seatReg, childProps, [false, 'models', 'child-1', FAKE, null, false, '', null]);
assert(childSeatLoaded.includes('model-b'), 'child seat shows its own model once loaded: ' + childSeatLoaded);

const leadSeat = textOf(seatReg, leadProps, [false, 'team', 'lead-1', FAKE, null, false, '', null]);
assert(leadSeat.includes('队友') && !leadSeat.includes('队友模型'), 'lead seat is compact (glyph + model, no long label): ' + leadSeat);
assert(leadSeat.includes('2 位队友'), 'lead seat shows teammate count: ' + leadSeat);

const childHeaderNodes = walk(render(headerReg, childProps, []));
assert(childHeaderNodes.every((n) => n.props?.className !== 'tm9a_count'), 'child header has no teammate count');
const childHeaderLoaded = textOf(headerReg, childProps, [false, 'models', 'child-1', FAKE, null, false, '', null]);
assert(childHeaderLoaded.includes('model-b'), 'child header shows its own model without opening: ' + childHeaderLoaded);

const childModels = render(seatReg, childProps, [true, 'models', 'child-1', FAKE, null, false, '', { left: 100, top: 200 }]);
const childModelsText = collectText(childModels).join('|');
assert(childModelsText.includes('reviewer'), 'child models pane focuses the child itself');
const childHeadButtons = walk(childModels).filter((n) => n.type === 'button' && String(n.props?.className ?? '').includes('tm9a_row') && n.props?.style?.minHeight === 24);
assert(childHeadButtons.length === 0, 'child models pane has no back row');
assert(!childModelsText.includes('Stronger agentic coding'), 'english description is not rendered');
assert(!childModelsText.includes('成本更高'), 'no chinese description either (user asked to drop it)');
const classTokens = (n) => String(n.props?.className ?? '').trim().split(' ').filter(Boolean);
const searchRow = walk(render(seatReg, childProps, [true, 'models', 'child-1', BIG, null, false, '', null])).find((n) => classTokens(n).includes('tm9a_search'));
assert(searchRow !== undefined, 'models pane renders a search field');
assert(!classTokens(searchRow ?? {}).includes('tm9a_searchWithQuery'), 'empty query keeps the plain search field');
assert(String(searchRow?.props?.placeholder ?? '').endsWith('…'), 'search placeholder uses the official ellipsis: ' + searchRow?.props?.placeholder);
const typed = walk(render(seatReg, childProps, [true, 'models', 'child-1', BIG, null, false, 'gpt', null]));
assert(typed.some((n) => classTokens(n).includes('tm9a_searchWithQuery')), 'typed query pads the field for the clear button');
assert(typed.some((n) => n.props?.['aria-label'] === '清空搜索'), 'clear button is announced to screen readers');
assert(childModelsText.includes('推理强度'), 'models pane exposes the 推理强度 cell');
assert(childModelsText.includes('High'), 'effort cell shows the current effort');

const effortPaneText = collectText(render(seatReg, childProps, [true, 'effort', 'child-1', FAKE, null, false, '', { left: 100, top: 200 }])).join('|');
assert(['Off', 'Low', 'High', 'Max'].every((name) => effortPaneText.includes(name)), 'effort pane lists every level: ' + effortPaneText);
assert(!effortPaneText.includes('Use for simple tasks'), 'effort pane carries no english description');

const leadModelsNodes = walk(render(headerReg, leadProps, [true, 'models', 'lead-1', FAKE, null, false, '', null]));
assert(leadModelsNodes.filter((n) => n.type === 'button' && n.props?.style?.minHeight === 24).length === 1, 'lead models pane has a back row');

const teamPaneText = textOf(headerReg, leadProps, [true, 'team', undefined, FAKE, null, false, '', null]);
assert(teamPaneText.includes('选择要设置模型的成员'), 'team pane lists members');
assert(teamPaneText.includes('tester'), 'team pane lists teammates');

const errorText = textOf(headerReg, leadProps, [true, 'team', undefined, null, 'boom', false, '', null]);
assert(errorText.includes('boom') && errorText.includes('重试'), 'error state shows message + retry');

const noticeText = textOf(headerReg, leadProps, [true, 'models', 'child-1', FAKE, null, false, '', null, '该队员当前不在线，模型已记下，下次启动时生效']);
assert(noticeText.includes('下次启动时生效'), 'queued notice is shown as a neutral notice');

/* ---------- 设置页 ---------- */
const settingsReg = registrations.find((r) => r.spec?.name === 'settings.section');
if (settingsReg === undefined) throw new Error('settings.section was not registered');
assert(settingsReg.spec.id === 'team-model' && settingsReg.spec.label === '队友模型', 'settings page registers id + label');

const settingsText = collectText(render(settingsReg, {}, [GLOBALS, false, null, null, null])).join('|');
assert(settingsText.includes('队友模型'), 'settings page has a title');
assert(settingsText.includes('reviewer') && settingsText.includes('tester'), 'settings page lists every teammate: ' + settingsText);
assert(settingsText.includes('修模型入口'), 'settings page labels the team with the session title');
assert(settingsText.includes('整队统一'), 'settings page offers a bulk action per team');
assert(settingsText.includes('离线'), 'settings page marks offline teammates');

const pickerText = collectText(render(settingsReg, {}, [GLOBALS, false, null, null, 'child-1'])).join('|');
assert(pickerText.includes('AI Hub') && pickerText.includes('Model B'), 'picker opens for one member with provider groups: ' + pickerText);

const settingsEmpty = collectText(render(settingsReg, {}, [null, false, null, null, null])).join('|');
assert(settingsEmpty.includes('读取中') || settingsEmpty.includes('当前没有在线的'), 'settings page handles the empty/loading state');

const settingsError = collectText(render(settingsReg, {}, [null, false, 'boom', null, null])).join('|');
assert(settingsError.includes('boom'), 'settings page shows rpc errors');

console.log('OK registrations=' + registrations.map((r) => r.spec.name + '#' + (r.spec.order ?? 0)).join(','));
console.log('OK rendered 11 states without throwing, styleTag=' + styleTagFound);
