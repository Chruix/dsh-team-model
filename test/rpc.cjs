/* RPC 回归：直接打插件自建的 loopback 通道，覆盖 tm.state / tm.setModel 的读写与线上格式。
 *
 * 需要正在运行的 DSH（Web GUI 端口）与一个装着本插件的会话：
 *   DSH_RPC_BASE=http://127.0.0.1:43189/dsh-team-model \
 *   DSH_LEAD_SESSION=<lead session id> DSH_CHILD_SESSION=<teammate child session id> \
 *   node test/rpc.cjs
 */
const BASE = process.env.DSH_RPC_BASE ?? 'http://127.0.0.1:43189/dsh-team-model';
const LEAD = process.env.DSH_LEAD_SESSION ?? '';
const CHILD = process.env.DSH_CHILD_SESSION ?? '';
let counter = 0;

async function call(endpoint, payload) {
	const rpcId = 't' + ++counter;
	const response = await fetch(BASE + '/' + endpoint, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ type: 'client-request', rpcId, method: endpoint, payload }),
	});
	const text = await response.text();
	let body;
	try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 200) }; }
	if (response.status !== 200) throw new Error(endpoint + ' HTTP ' + response.status + ' ' + text.slice(0, 200));
	if (body.rpcId !== rpcId) throw new Error('rpcId mismatch');
	return body.result;
}

const results = [];
function check(name, condition, detail) {
	results.push({ name, ok: condition === true, detail });
	console.log((condition === true ? 'ok   ' : 'FAIL ') + name + (detail === undefined ? '' : ' :: ' + detail));
}

if (LEAD === '' || CHILD === '') {
	console.log('skip  set DSH_LEAD_SESSION and DSH_CHILD_SESSION (ids from your own session log) to run this suite');
	process.exit(0);
}

(async () => {
	const leadState = await call('tm.state', { sessionId: LEAD, leadSessionId: LEAD });
	check('state(lead) ok', leadState.ok === true);
	const members = leadState.value.members;
	check('state(lead) has one lead and some teammates', members.filter((m) => m.role === 'lead').length === 1 && members.length >= 2, 'members=' + members.length);
	check('state(lead) selfId is lead', leadState.value.selfId === LEAD, leadState.value.selfId);
	const resolved = members.filter((m) => typeof m.model === 'string' && m.model !== '').length;
	check('every member has a resolved model', resolved === members.length, resolved + '/' + members.length);
	const groups = leadState.value.catalog?.groups ?? [];
	check('catalog has groups/models', groups.length > 0 && groups.every((g) => Array.isArray(g.models)), 'groups=' + groups.length);

	const childState = await call('tm.state', { sessionId: CHILD, leadSessionId: LEAD });
	const childSelf = (childState.value.members ?? []).find((m) => m.id === CHILD);
	check('state(child) includes the child itself', childSelf !== undefined, childSelf === undefined ? 'missing' : childSelf.model);
	check('state(child) selfId is child', childState.value.selfId === CHILD, childState.value.selfId);

	/* 未知会话：应被当作"当前会话自己"插进名单，而不是报错 */
	const rando = await call('tm.state', { sessionId: 'no-such-session-1234', leadSessionId: LEAD });
	check('state(unknown) synthesises a self row', (rando.value.members ?? []).some((m) => m.id === 'no-such-session-1234'));

	/* 无效模型：必须报可读错误，不能静默成功 */
	const bad = await call('tm.setModel', { sessionId: CHILD, provider: 'no-such-provider', model: 'no-such-model' });
	check('setModel(bad) fails with a message', bad.ok === false && typeof bad.error?.message === 'string', bad.ok === false ? bad.error.message : 'unexpectedly ok');

	/* 离线队友：queued，并在 state 里回显路由（用目录里的第一条路由，与本机配置无关） */
	const route = { provider: groups[0].id, model: groups[0].models[0].id };
	const queued = await call('tm.setModel', { sessionId: CHILD, provider: route.provider, model: route.model });
	check('setModel(inactive) queues', queued.ok === true && queued.value.queued === true, JSON.stringify(queued.value ?? queued.error));
	const after = await call('tm.state', { sessionId: CHILD, leadSessionId: LEAD });
	const queuedMember = (after.value.members ?? []).find((m) => m.id === CHILD);
	check('queued route shows up in state', queuedMember?.model === route.model, JSON.stringify({ want: route.model, got: queuedMember?.model }));

	/* 线上格式与健壮性 */
	const unknown = await fetch(BASE + '/tm.nope', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
	check('unknown endpoint -> 404', unknown.status === 404, 'status=' + unknown.status);
	const wrongMethod = await fetch(BASE + '/tm.state', { method: 'GET' });
	check('GET -> 404', wrongMethod.status === 404, 'status=' + wrongMethod.status);
	const wrongType = await fetch(BASE + '/tm.state', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x' });
	check('non-json content-type -> 415', wrongType.status === 415, 'status=' + wrongType.status);

	const failed = results.filter((r) => r.ok !== true);
	console.log('\n' + (failed.length === 0 ? 'ALL ' + results.length + ' CHECKS PASSED' : failed.length + ' CHECK(S) FAILED'));
	process.exit(failed.length === 0 ? 0 : 1);
})().catch((error) => {
	console.error('HARNESS ERROR: ' + (error?.stack ?? error));
	process.exit(2);
});
