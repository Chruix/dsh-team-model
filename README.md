# dsh-team-model

> 给 [DeepSeek Harness](https://github.com/deepseek-ai) 的 Agent Teams 补上「按队友指定模型」：模型自己能选，用户也能在会话里改。

**English** — A DeepSeek Harness plugin that lets an Agent Team give every teammate its own model. The stock team plugin (`@deepseek-ai/dsh-experimental-agent-team`) has no model parameter on `spawn_teammate`, so teammates always inherit the Lead's route. This plugin adds a `spawn_teammate_with_model` tool (usable by the model itself), three Web UI entry points for humans (session header, composer tool row, Settings page), and pins the route so later turns keep the chosen model. Implementation uses only public surfaces: a new tool, a durable `model/selection` event, an `agent/request` waterfall, and a loopback RPC on the bare `webServer`. MIT licensed.

内置的团队插件（`@deepseek-ai/dsh-experimental-agent-team`）创建队友时不接受模型参数 —— `spawn_teammate` 只有 `name / description / prompt / context`，两个本地 subagent provider 也只认 `providerName`，于是所有队友都继承 Lead 当前的路由。

这个插件补上这块能力，并且只用框架的公开面实现：新增一个工具、往子会话写一条既有的 `model/selection` 事件、在 `agent/request` 里钉住路由、再用一条 loopback RPC 支撑 Web UI。

## 功能

**1. 模型可以给队友选模型**

新增工具 `spawn_teammate_with_model`，参数与内置 `spawn_teammate` 完全一致，多三个可选项：

```jsonc
{
  "name": "reviewer",              // 必填，[a-z0-9-]，≤64 字符
  "description": "代码审查",       // 必填
  "prompt": "审查这次改动…",        // 必填
  "context": "fresh",              // fresh | fork
  "provider": "openai",            // 可选，省略则按 model 在目录里唯一匹配
  "model": "gpt-5",                // 可选，省略则继承当前会话
  "reasoning_effort": "high"       // 可选，模型支持才生效
}
```

模型在队友**首轮请求之前**就写进子会话，所以第一次回复就用新路由，不会先跑一轮继承模型。

**2. 用户可以在三处切换**

| 入口 | slot | 说明 |
| --- | --- | --- |
| 会话头部胶囊 | `conversation.session.header.actions` | 列出本队队友，点开选模型 |
| 输入框工具行 | `conversation.input.right` | 窄屏自动收成图标 + 模型名 |
| 设置 → 队友模型 | `settings.section` | 按会话分组，单个改 / 整队统一，含离线队友 |

在队友会话里打开时自动聚焦该队友（标题变成「模型」），只改它自己的模型，不再列整支团队。

**3. 改完真的粘住**

`selectionFor(agent).current` 是一次性的：请求消费一次就清空并回退到会话头/默认模型。插件在**队友** agent 上挂 `agent/request` waterfall，按会话投影 `modelSelection.pending ?? lastUsed` 覆写 provider/model/reasoningEffort，所以第二轮、第三轮都还是你选的模型。

**4. 离线队友也能排队**

不在线的队友没有活 Agent，切换会进队列（`queued`），在它下次启动时第一条请求前写入；界面会提示「该队友当前不在线，模型已记下，下次启动时生效」。

## 安装

插件是一个标准的 DSH bundle（`package.json` + `cordis.patch.yml` + host/client 两个入口）。

```bash
git clone <repo> ~/.dsh/plugins/dsh-team-model
```

然后在 DSH 的插件管理器里以该目录安装（`install_bundle`），或在 profile 里加一行：

```yaml
- insert:
    - id: team-model
      name: dsh-team-model
```

依赖的 Host 服务：`agents / agentTeams / tools / systemPrompt / sessionController / llm / connection / webServer`。缺任一项该 profile 不会激活本插件。

## 架构

```
index.js   Host 半边（Cordis 插件）
  ├─ spawn_teammate_with_model   新增工具，只对 Lead 的 agent.ctx 注册
  ├─ applySelection / applyOrQueue
  │    ctx.sessionController.agents.selectForNextRequest(agent, selection)
  │    = append 一条 durable 的 model/selection + 同步当前选择
  ├─ agent/request pin           队友第二次及以后仍按投影覆写路由
  ├─ RPC /dsh-team-model         直挂 ctx.get('webServer') 的 prefix 路由
  │    tm.state / tm.setModel / tm.globals / tm.setAll
  └─ team:model 说明段           注入 Lead 的 system prompt

client.js  Web UI 半边
  ├─ 三个 slot 注册（header #5 / input.right #0 / settings.section #45）
  ├─ MenuSurface + MenuGroup 原生弹层，CSS 模块字符串注入
  └─ 通过 ctx.connection.rpc.call('/dsh-team-model', endpoint, payload) 取数
```

**为什么 RPC 不走 `ctx.connection.rpc.handle`？** 在 0.2.1-rc.5 里它把注册落在 connection 服务自己的 ctx 上，那个 ctx 读不到 `webServer`，第三方插件调用必抛 `cannot get property "webServer" without inject`（表现为客户端 HTTP 405）。`ctx.get('webServer')` 能绕过注入守卫拿到服务，于是插件自己实现 RPC 信封：

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
    defaultProvider: ""     # 默认模型所属提供方；留空按目录唯一匹配推断
    freshProvider: "spawn"  # 沿用内置工具插件的路由名
    forkProvider: "fork"
    tool: true              # 是否注册 spawn_teammate_with_model
    policy: true            # 是否给 Lead 注入一段使用说明
```

## 已知限制

- 团队是**每会话一支**：Lead 只能管自己会话的队友，所以「全局设置」= 遍历所有在线 Lead。
- 内置团队插件 `maxMembers` 默认 8，且没有移除队友的公开入口。
- 推理强度是 per-model 的：目录里 `reasoning.efforts` 为空的 provider（例如某些聚合网关）不显示强度入口，传了会被拒绝并给出可读错误。
- UI 依赖前端 shell 提供的虚拟模块 `@deepseek-ai/dsh-client-ui-primitives`，不需要在 `package.json` 里声明依赖。

## 开发

```bash
node --check index.js && node --check client.js
```

改完代码必须让 loader 重新 import：

```
remove_bundle dsh-team-model
install_bundle <本目录>
```

回执里 `"application": "applied"` 才算生效（`install_bundle` 对已安装包只回 `already-installed`）。仓库内的 `test/` 是三套 Node 冒烟测试：渲染（fake React/primitives）、RPC、批量端点。

## License

MIT
