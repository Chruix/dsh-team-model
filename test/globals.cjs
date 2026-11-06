/* 覆盖 tm.globals / tm.setAll：跨会话聚合、批量设置、离线排队与错误处理。
 *
 *   DSH_RPC_BASE=http://127.0.0.1:43189/dsh-team-model node test/globals.cjs
 *
 * 默认只读：只验证 tm.globals 的聚合与目录。要真正改写队友模型（会写进本机会话日志）
 * 再加 DSH_TM_LIVE=1。
 */
const BASE = process.env.DSH_RPC_BASE ?? 'http://127.0.0.1:43189/dsh-team-model';

async function call(endpoint, payload) {
	const response = await fetch(`${BASE}/${endpoint}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', host: new URL(BASE).host },
		body: JSON.stringify({ type: 'client-request', rpcId: 'g' + Math.random().toString(16).slice(2), method: endpoint, payload })
	});
	const text = await response.text();
	let body;
	try { body = JSON.parse(text); } catch { body = text; }
	return { status: response.status, body };
}

function assert(ok, message) {
	if (!ok) throw new Error('FAILED: ' + message);
	console.log('ok  ' + message);
}

(async () => {
	const globals = await call('tm.globals', {});
	assert(globals.status === 200, 'globals 200');
	const value = globals.body?.result?.value;
	const teams = value?.teams ?? [];
	assert(Array.isArray(teams) && teams.length > 0, 'globals lists at least one team (teams=' + teams.length + ')');
	const members = teams.flatMap((team) => team.members);
	assert(members.length > 0, 'globals lists teammates (members=' + members.length + ')');
	assert(members.every((member) => member.role === 'teammate'), 'only teammates are listed');
	assert(members.every((member) => typeof member.providerId === 'string' && member.providerId !== ''), 'every teammate has a resolved provider');
	assert(Array.isArray(value?.catalog?.groups) && value.catalog.groups.length > 0, 'globals carries the catalog');
	console.log('    sample: ' + members.slice(0, 3).map((m) => `${m.name}=${m.providerId}/${m.model}${m.live ? '' : '(offline)'}`).join(', '));

	/* 默认只读：下面几项会真的调用 tm.setAll 改写本机队友模型。 */
	if (process.env.DSH_TM_LIVE !== '1') {
		console.log('skip  mutating checks (set DSH_TM_LIVE=1 to also exercise tm.setAll)');
		console.log('ALL GLOBALS CHECKS PASSED');
		return;
	}

	const bad = await call('tm.setAll', { provider: 'no-such-provider', model: 'x' });
	assert(bad.body?.result?.ok === false && /no adapter|unknown provider|cannot route/i.test(String(bad.body.result.error.message)), 'setAll rejects an unknown provider with a readable message');

	const none = await call('tm.setAll', {});
	assert(none.body?.result?.ok === false, 'setAll without a model fails');

	const offline = members.find((member) => member.live !== true);
	if (offline === undefined) {
		console.log('skip  no offline teammate to poke');
	} else {
		const group = value.catalog.groups[0];
		const model = group.models[group.models.length - 1];
		const one = await call('tm.setAll', { sessionIds: [offline.id], provider: group.id, model: model.id, reasoningEffort: model.reasoning?.defaultEffort });
		const result = one.body?.result?.value;
		assert(one.body?.result?.ok === true, 'setAll with sessionIds succeeds');
		assert(result?.total === 1 && result?.queued === 1, 'offline teammate is queued, not applied: ' + JSON.stringify(result));
		const after = await call('tm.globals', {});
		const refreshed = (after.body?.result?.value?.teams ?? []).flatMap((team) => team.members).find((member) => member.id === offline.id);
		assert(refreshed?.model === model.id, 'queued route shows in globals: ' + JSON.stringify({ want: model.id, got: refreshed?.model }));
	}

	console.log('ALL GLOBALS CHECKS PASSED');
})().catch((error) => {
	console.error(String(error?.message ?? error));
	process.exitCode = 1;
});
