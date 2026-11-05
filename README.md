# dsh-team-model

中文 · [English](README.en.md)

> 为 [DeepSeek Harness](https://github.com/deepseek-ai) 的 Agent Teams 补上「按队友指定模型」：模型可以自己指定，用户也可以在 Web UI 里随时修改。

内置团队插件 `@deepseek-ai/dsh-experimental-agent-team` 在创建队友时不接受模型参数——`spawn_teammate` 只有 `name / description / prompt / context`，两个本地 subagent provider 也只认 `providerName`，因此所有队友都继承 Lead 当前的路由。

这个插件补上这一层，并且只使用框架的公开接口：新增一个工具、向子会话写入一条既有的 `model/selection` 事件、在 `agent/request` 中保持路由，再用一条 loopback RPC 支撑 Web UI。

## 功能

### 1. 模型可以自己指定队友的模型

新增工具 `spawn_teammate_with_model`，参数与内置 `spawn_teammate` 一致，另有三项可选：

```jsonc
{
  "name": "reviewer",              // 必填，[a-z0-9-]，≤64 字符
  "description": "代码审查",       // 必填
  "prompt": "审查这次改动…",        // 必填
  "context": "fresh",              // fresh | fork
  "provider": "openai",            // 可选，省略则按 model 在目录中唯一匹配
  "model": "gpt-5",                // 可选，省略则继承当前会话
  "reasoning_effort": "high"       // 可选，模型支持时生效
}
```

模型会在队友的首轮请求之前写入子会话，因此第一次回复就使用新路由，不会先用继承的模型跑一轮。

### 2. 用户可以在三处切换

| 入口 | slot | 说明 |
| --- | --- | --- |
| 会话头部胶囊 | `conversation.session.header.actions` | 列出本队队友，点开选模型 |
| 输入框工具行 | `conversation.input.right` | 窄屏自动收成图标 + 模型名 |
| 设置 → 队友模型 | `settings.section` | 按会话分组，单个修改或整队统一，含离线队友 |

在队友会话里打开时会自动聚焦该队友（标题显示「模型」），只修改它自己的模型，不再列出整支团队。

### 3. 切换后一直有效

内置的模型选择是一次性的：`selectionFor(agent).current` 被一次请求消费后就清空，下一次请求回退到会话头或默认模型——表现为「切换只生效一轮」。插件在**队友** agent 上挂 `agent/request` waterfall，按会话投影 `modelSelection.pending ?? lastUsed` 覆写 provider/model/reasoningEffort，因此第二轮、第三轮仍然是你选的那个模型，直到你再次修改。

### 4. 离线队友也能排队

不在线的队友没有运行中的 Agent，选择会进入队列（`queued`），在它下次启动时、第一条请求之前写入；界面会提示「该队友当前不在线，模型已记下，下次启动时生效」。

## 安装

插件是一个标准的 DSH bundle（`package.json` + `cordis.patch.yml` + host/client 两个入口）。

```bash
git clone https://github.com/Chruix/dsh-team-model ~/.dsh/plugins/dsh-team-model
```

然后在 DSH 的插件管理器里安装该目录（`install_bundle`），或在 profile 中插入一行：

```yaml
- insert:
    - id: team-model
      name: dsh-team-model
```

依赖的 Host 服务：`agents / agentTeams / tools / systemPrompt / sessionController / llm / connection / webServer`。缺少任一项时，该 profile 不会激活本插件。

## 架构

```
index.js   Host 半边（Cordis 插件）
  ├─ spawn_teammate_with_model   新增工具，只注册到 Lead 的 agent.ctx
  ├─ applySelection / applyOrQueue
  │    ctx.sessionController.agents.selectForNextRequest(agent, selection)
  │    = 追加一条 durable 的 model/selection + 同步当前选择
  ├─ agent/request 钩子          队友第二轮及以后仍按投影覆写路由
  ├─ RPC /dsh-team-model         直接挂在 ctx.get('webServer') 的 prefix 路由
  │    tm.state / tm.setModel / tm.globals / tm.setAll
  └─ team:model 说明段           注入 Lead 的 system prompt

client.js  Web UI 半边
  ├─ 三个 slot 注册（header #5 / input.right #0 / settings.section #45）
  ├─ MenuSurface + MenuGroup 原生弹层，CSS 模块字符串注入
  └─ 通过 ctx.connection.rpc.call('/dsh-team-model', endpoint, payload) 取数
```

**为什么 RPC 不走 `ctx.connection.rpc.handle`？** 在 0.2.1-rc.5 中，它把注册落在 connection 服务自己的 ctx 上，而那个 ctx 读不到 `webServer`，第三方插件调用时必然抛出 `cannot get property "webServer" without inject`（在客户端表现为 HTTP 405）。`ctx.get('webServer')` 可以绕过注入守卫拿到服务，因此插件自行实现 RPC 信封：

```
POST /dsh-team-model/<endpoint>
  → { type: "client-request", rpcId, method: endpoint, payload }
  ← { type: "server-response", rpcId, result: { ok: true, value } | { ok: false, error } }
```

## 配置

```yaml
- id: team-model
  name: dsh-team-model
  config:
    defaultModel: ""        # 未显式指定时的默认队友模型（provider/model 或裸 model id）
    defaultProvider: ""     # 默认模型所属提供方；留空则按目录唯一匹配推断
    freshProvider: "spawn"  # 沿用内置工具插件的路由名
    forkProvider: "fork"
    tool: true              # 是否注册 spawn_teammate_with_model
    policy: true            # 是否向 Lead 注入一段使用说明
```

## 已知限制

- 团队按会话隔离：Lead 只能管理自己会话中的队友，因此「全局设置」的实现方式是遍历所有在线 Lead。
- 内置团队插件的 `maxMembers` 默认为 8，且没有移除队友的公开接口。
- 推理强度由各模型分别声明：目录中 `reasoning.efforts` 为空的提供方（例如某些聚合网关）不显示强度入口，强行传入会被拒绝并返回可读的错误信息。
- UI 依赖前端 shell 提供的虚拟模块 `@deepseek-ai/dsh-client-ui-primitives`，无需在 `package.json` 中声明依赖。

## 开发

```bash
node --check index.js && node --check client.js
```

修改代码后需要让 loader 重新 import：

```
remove_bundle dsh-team-model
install_bundle /path/to/dsh-team-model
```

回执中出现 `"application": "applied"` 才算生效（对已安装的包，`install_bundle` 只会返回 `already-installed`）。仓库中的 `test/` 包含三套 Node 冒烟测试：渲染（fake React/primitives）、RPC 与批量端点。

```bash
node test/client-smoke.cjs                       # 无需运行中的宿主
DSH_RPC_BASE=http://127.0.0.1:43189/dsh-team-model \
  DSH_LEAD_SESSION=<lead id> DSH_CHILD_SESSION=<child id> \
  node test/rpc.cjs
DSH_RPC_BASE=http://127.0.0.1:43189/dsh-team-model node test/globals.cjs
```

## License

MIT
