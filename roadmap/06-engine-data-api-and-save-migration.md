# 06 · 引擎、数据、接口与存档迁移

状态：拟实施技术规格。以下模块与接口尚不存在，不能据此声称 Agent 已接通。

## 1. 运行架构

```text
浏览器
  玩家输入 → 20 Hz 纯规则引擎 → 世界状态 → Three.js / 界面
                  │    ↑
                  │    └─ 下一 tick 校验并应用合法意图
                  ↓
            1 Hz 生态观察与机会
                  ↓
             定时请求适配器 ───────┐
                  ↑              │ 异步 HTTP
             ready inbox         ↓
                           同源 Node.js 提案服务
                           会话 / 配额 / 严格校验
                           SQLite 任务记录
                           模型适配器与服务端密钥

浏览器 IndexedDB：游戏快照、事件、写入租约、迁移备份
服务端 SQLite：模型任务、用量、失效状态；不托管本局数值权威
```

首版继续使用现有 Node 工具链，新增独立的提案服务。SQLite 驱动在 M0 按实际 Node 运行环境验证后锁定；不能在浏览器打包中引入原生服务端模块。参考工程仍保持独立，不通过共享它的数据库或运行进程实现功能。

生产由同源代理提供 `/api/ecology/*`，静态游戏仍可单独运行。缺少 API 时自动使用规则控制；模型服务的部署是后续实施工作，不包含在本轮文档交付中。

## 2. 模块切分与变更落点

| 拟定模块 | 职责 |
| --- | --- |
| `src/core/clock.js` | tick、日段、日历转换和游戏定时槽 |
| `src/core/weather.js` | 天气日历、转移、预报、天气效果与风雨预订 |
| `src/core/ecology.js` | 群体、感知、结构版本和机会生成 |
| `src/core/ecology-controller.js` | 确定性行为选择和群体执行 |
| `src/core/ecology-commands.js` | 严格验证与应用外来意图，稳定错误原因 |
| `src/core/sea-navigation.js` | 海路、登陆点、潮位通道和撤离 |
| `src/core/migration.js` | 来客队伍、成员、预警、配额与完整生命周期 |
| `src/core/chapter.js` | 初岛目标、考验、稳定期、胜利事件 |
| `src/core/events.js` | 有界事件序列、命令去重和重要证据 |
| `src/agent/client.js` | HTTP、会话、轮询和 ready inbox；不写实体 |
| `src/agent/scheduler.js` | 游戏槽位与现实请求配额的桥接 |
| `src/core/persistence-v3.js` | V3 IndexedDB 快照、事件、写入租约和迁移 |
| `server/ecology/` | 请求路由、任务 repository、provider 适配器、schema 校验、预算 |

现有 `simulation.js` 负责确定的调用顺序，逐步抽出天气、生态和考验，不一次重写所有移动/战斗。`config.js` 增加物种、动作和目标定义；`state.js` 只组装合法初始状态。

`terrain.js`、`water.js` 与 `view/water.js` 接入共享潮位；`view/assets.js`、`view/creature.js` 和模型生成脚本增加两栖资产。`ui/interface.js`、`templates.js`、`dialogs.js` 与样式新增天气预报、海岸提示、章节目标和结算。

## 3. 世界状态提案

下面是字段示意，ID 为说明占位，不可直接作为正式存档导入。

```json
{
  "version": 3,
  "rulesVersion": "isle-v3-e1",
  "saveId": "generated-uuid",
  "clock": {"tick": 0, "daySeconds": 360, "startHour": 8},
  "weatherV3": {
    "current": "clear", "startTick": 0, "endTick": 3600,
    "epoch": 0, "publishedUntilTick": 3600,
    "schedule": [], "lastSquallStartTick": null
  },
  "tide": {"phaseOffset": -1.57079632679, "bucket": "low", "navRevision": 0},
  "ecology": {
    "groups": [], "arrivals": [], "reservations": [],
    "dayQuotas": [], "adaptationUntilTick": 12000,
    "nextIslandSlot": 1, "nextMarineSlot": 1,
    "resolvedSlots": {}, "appliedCommandIds": []
  },
  "chapter": {
    "id": "first_island", "version": 1, "status": "active",
    "trial": null, "stableSinceTick": null,
    "lastDisruptionEventSeq": 0, "victory": null
  },
  "randomStreams": {"weather": 1, "ecology": 2, "marine": 3},
  "eventSeq": 0, "recentEvents": [], "chapterEvidence": []
}
```

原有 player、agents、resources、buildings、parts、colony、discovered、completed 等核心字段保留。`weatherV3` 与 `clock` 是 V3 内部对象；迁移时从旧 `weather/weatherAt/time` 生成，不能让新旧值并列成为两个权威。

`runEpoch` 属于运行所有权，打开存档取得写入权时新建；可以放在运行日志，但不能从导入 JSON 恢复成可接受旧网络结果的身份。`saveId` 是存档身份，复制导入时生成新 ID，原 ID 留在 provenance 供诊断。

### 3.1 个体、群体和来客字段

| 对象 | 必要新字段 |
| --- | --- |
| 个体 | `origin: resident/marine/hatched`、`groupId`、`arrivalId`、`movementProfile`、`controller`、`lootClaimed` |
| 群体 | `id/species/memberIds/groupRevision/regionId/intent/knownEvents/relationshipTags` |
| 意图 | `commandId/actionId/variantId/sourceSlot/startTick/untilTick/controllerSource` |
| 来客队伍 | `id/species/roster/status/routeId/phaseTick/warningTick/onshoreTick/departureTick/outcome` |
| 来客成员记录 | `id/status/lootEventId/transferEventId`；结束后也能证明没有再次出生或掉落 |
| 考验 | `id/status/scheduledStartTick/endTick/arrivalId/feeEvents/routeEvidence/completedRoutes/refundEventId` |

实体当前的坐标、HP、路径和冷却不转移到群体总数中。小芽另外保存 `reservedFood`，表示背包里不自动入库的携带口粮，取粮、归还、投喂和倒下要与 `carry.food` 一起结算。群体成员列表必须与真实实体互相引用，任何缺失引用都要在加载校验中拒绝或按明确兼容策略修复。

## 4. 请求接口

首版轮询即可，不要求 SSE/WebSocket。轮询等待的是提案结果，游戏世界同时运行。

| 接口 | 行为 |
| --- | --- |
| `POST /api/ecology/session` | 创建 HttpOnly/SameSite 同源会话；不创建游戏存档、不发起模型调用 |
| `POST /api/ecology/decisions` | 校验、去重、预算预占，返回 202 + job ID；同输入重复请求返回原 job |
| `GET /api/ecology/decisions/:jobId` | 返回 queued/running/ready/failed/expired 与必要元数据；限所属会话 |
| `POST /api/ecology/decisions/:jobId/receipt` | 可选幂等应用回执，不能作为在线奖励或胜负权威 |
| `GET /api/ecology/health` | 仅提供是否可用和契约版本，不暴露 key、完整 endpoint 或环境变量 |

客户端从 0.75 秒开始轮询，逐步退至 2 秒；手动/面板暂停不创建新任务，可接收原 job 的结果。页面隐藏停止轮询并释放运行所有权，显示后丢弃旧运行待定任务，不补发付费请求。ready 结果完成时若未超过服务端计算 deadline，可保留至诊断保留期结束；同一 runEpoch 的手动暂停后恢复仍要通过游戏槽位校验。

### 4.1 请求包

```json
{
  "schema_version": 1,
  "rules_version": "isle-v3-e1",
  "request_id": "generated-request-uuid",
  "save_id": "generated-save-uuid",
  "run_epoch": "generated-runtime-uuid",
  "source_tick": 2400,
  "observation_hash": "sha256-of-canonical-observation",
  "roles": [
    {
      "role": "island",
      "slot_index": 1,
      "groups": [
        {
          "group_id": "mossback_meadow_1",
          "group_revision": 3,
          "observed_region_ids": ["meadow", "grove_edge"],
          "basis": [{"id": "evt:18", "kind": "observed_threat", "region_id": "meadow"}]
        }
      ],
      "opportunities": [
        {
          "id": "island:1:mossback_meadow_1",
          "group_id": "mossback_meadow_1",
          "allowed_choices": [
            {"action_id": "avoid_region", "variant_id": "move_to_grove_edge"},
            {"action_id": "hold", "variant_id": "safe_local_roam"}
          ],
          "basis_ids": ["evt:18"]
        }
      ]
    }
  ]
}
```

示例中的 `move_to_grove_edge` 必须在客户端纯规则引擎生成的目录中绑定实际可达目标、持续时间、前置条件和资源占用，不能把字符串解析成任意程序。

服务端重新计算规范化观察哈希并与请求比对；同一 `request_id` 携带不同输入返回 409。请求 key 在所属服务端会话内唯一，另保存 `(saveId, runEpoch, role, slotIndex)` 防止用新 request ID 重复支付同槽。限制 schema、大小和速率独立于客户端自报值。

服务端限额初值为会话 48 次/小时、匿名来源预算桶 96 次/小时、整服务 192 次/小时，均使用现实时间；来源桶由可信代理/连接信息派生并最小化保留，不使用浏览器任意提交的地址。实际供应商尝试发生前原子预占额度，失败也计入；只有确定尚未向供应商发出的排队取消可以释放预占。

### 4.2 模型返回包

```json
{
  "schema_version": 1,
  "choices": [
    {
      "role": "island",
      "opportunity_id": "island:1:mossback_meadow_1",
      "action_id": "avoid_region",
      "variant_id": "move_to_grove_edge",
      "basis_ids": ["evt:18"],
      "reason": "这一带刚出现威胁，沿已知林缘暂避。"
    }
  ]
}
```

限制：`additionalProperties=false`；choices 最多 6；每机会最多一条；reason 最多 120 个 Unicode 字符；basis 最多 4 且必须来自对应机会。禁止金额、出生数量、HP、伤害、坐标、天气、胜利、代码、工具名或额外 URL 字段。

request/job/run/hash 等绑定元数据由服务端包在模型输出外层，不依赖模型正确复述。客户端除检查签收对象身份之外，还必须重新执行自己的动作和当前状态校验。

### 4.3 双 deadline

- `providerDeadlineAt`：请求真正开始时起 12 秒现实时间；超过则失败，不重试。服务队列超过 2 秒直接返回忙碌，不进入供应商调用。
- `responseAcceptByTick`：sourceTick +800 tick，即 40 秒模拟时间；超过或该槽已终结就不能应用。
- `intentUntilTick`：通过校验后意图的最长有效期，岛内不超过源槽 +3600 tick，海上不超过源槽 +4800 tick。它不是延长模型结果接受窗口。

已知是临时网络收包失败时可用同一 request ID 查询原 job。结果不明时不能创建第二个逻辑请求；模型 HTTP 失败不做自动修复或切换供应商重试。

## 5. 任务与事件存储

服务端最小表：

- `ecology_jobs`：session、request ID、runEpoch、观察哈希、角色/槽位、输入、status、claim token、deadline、输出、有限 telemetry。
- `ecology_job_slots`：每个职责槽对应哪个 job，唯一键防止合批/拆批重复收费。
- `ecology_usage`：会话、来源预算桶、时间、尝试次数及供应商返回的实际用量。
- `ecology_receipts`：客户端已应用或拒绝结果的幂等摘要，仅诊断。

状态为 `queued → running → ready/failed/expired`。claim 和写入输出均以状态 + claim token 条件更新；旧 worker 不能覆盖新状态。`ready` 不代表已在游戏世界执行；客户端消费结果单独记录。

原始任务输入/输出默认保留 24 小时，超过后删除正文，保留不含玩家文本的汇总计数。实际运行日志不需要将完整模型提示词写入每份浏览器存档。

浏览器：最近事件显示保留 256 条，已应用命令 ID 保留 256 条；更老的重复请求由每职责的已终结槽位高水位及 runEpoch 拒绝。章节关键证据、已结算来客成员和胜利证据另存，不随显示日志滚动丢失。完整回放按需导出到单独文件，不无限膨胀正常存档。

## 6. V3 本地持久化

V3 使用 IndexedDB 数据库 `zhongxi-isle`，至少有 `saves`、`events`、`leases`、`migration_backups` 四个 object store。存档记录 ID 为 `zhongxi-isle-v3:<saveId>`。V2 的 localStorage 键 `zhongxi-isle-v2` 保持独立。

选择 IndexedDB 是为了把快照、事件序号和写入租约放入同一事务，避免扩展后的事件与快照分散写入多个 localStorage 键。JSON 导出继续独立可读，玩家不需要理解存储实现。

每 10 秒、页面隐藏、考验阶段关键变化和胜利时创建检查点。快照 + 截止同一 `eventSeq` 的事件一起提交；不能保存新快照却丢掉同批扣费、出生或胜利证据。上一个已验证检查点保留用于恢复。

游戏运行是内存确定性提交，持久化是随后的检查点事务；崩溃可能回退到上次成功保存，不能宣传逐帧持久化。重要事件保存失败时保留内存状态并提示导出。

### 6.1 多标签页

同一 saveId 只允许一个写入者。可用时使用浏览器独占锁，同时用 IndexedDB 事务内的写入租约作为存储提交前置；其它标签页只读或提示在当前页接管。

租约包含 owner、fencing token 和现实到期时间。接管在事务内递增 token；旧标签即使醒来，其快照也不能通过 token 校验写回。页面隐藏时立即停止模拟，先尝试检查点事务，成功后释放所有权；显示时重新取得并从最新检查点加载，创建新 runEpoch。

不能假设浏览器关闭时会等待异步 IndexedDB 写入。10 秒周期检查点是恢复基线；`visibilitychange` 只是额外保存机会。保存明确失败且页面还活着时保留内存状态和错误提示，不主动用旧检查点替换它；关闭/接管后只能恢复已提交检查点。挂起页面无法续租时允许租约到期，旧写入者醒来必须先验证 token。

广播消息只负责通知界面，不能作为互斥的唯一保证。无法建立可靠事务和所有权的环境不启用写入运行，提供导出或重试入口。M0 应先验证目标浏览器的实际能力，不在文档阶段声称支持所有浏览器。

## 7. V2 → V3 迁移

1. 启动时先检查 V3；若没有有效 V3 且存在 V2，提供“升级并继续”和“保留原旅程”说明。迁移是玩家可见的版本选择，不自动覆盖旧记录。
2. 用原 V2 校验器验证原文。保存原文、原 SHA-256、迁移时间到备份 store，同时保留原 localStorage 键。备份失败则不开始迁移。
3. 生成新 saveId 与 V3 状态，保存 `migratedFromVersion=2`、原文哈希和转换器版本。
4. `clock.tick = round(old.time * 20)`；继承背包、资源、部件、建筑、人口、探索和六项引导。规范化误差不超过半 tick，不能用现实离线时间增长。
5. 当前晴/雨映射到同名 V3 状态，剩余时间来自 `old.weatherAt-old.time` 并限在 1–180 秒；迁移后的 600 秒不安排新敌对登陆或普通风雨。
6. 潮位相位设置为迁移时潮位项为 0，首 60 秒从原来的固定平均水位平滑引入振幅，避免突然淹没正在移动的个体。
7. 按现有合法实体重建群体；所有旧有被统治个体保留，排除野生调度。若旧档实体总数超过 V3 的硬上限，停止迁移并保留可玩的 V2，不自动删除生物。不给玩家凭空补两个新来客，海上系统从“尚无队伍”开始；`reservedFood` 初始为 0。
8. 原有六项引导可保持完成，但必须实际完成一次 V3 潮汐考验和最终安居窗口，不能仅因旧档时间长而立即获胜。原有有效模拟时间计入 W6 的 1800 秒要求。
9. 清除旧临时路径后重新规划；新增 nextSlot 设在迁移时刻之后，不补跑过去所有生态轮次；trial=null、stableSinceTick=null、victory=null。
10. 经 V3 严格校验和往返读取后，以事务发布为可用存档。失败保留旧旅程和备份，显示具体可操作错误；禁止坏新档覆盖好旧档。

“保留原旅程”要求实施时保留可启动的 V2 兼容入口或可访问的旧版本入口，不能只把字节留着却让玩家无法继续。M0 必须选定并验证这一交付方式。

### 7.1 V3 加载与导入

- 版本与规则兼容策略明确，不把任意未来版本当作可读。
- 限制文件大小、实体总数、群体/队伍数量、引用、天气表、坐标、数值有限性、专精前置、费用和奖励唯一性。
- 校验 stableSinceTick 不大于当前 tick，trial 事件顺序合法，won 记录引用齐全。不能单信一个 `won:true` 字段。
- 重载来客时保留成员与路径阶段，从实体当前位置重规划；海上死者不得走普通 150 秒 respawn 分支。
- 导入副本新建 saveId/runEpoch，保留合法的既往胜利记录与关键证据，但不继承服务端会话、配额身份或待应用模型任务。
- 不自动清空损坏 V3；保留原记录，可恢复上个检查点、导出错误样本或明确开启新旅程。

## 8. 提交顺序

每个固定 tick 按固定顺序：

1. 推进唯一时钟，提交到期天气/潮位变化与导航版本。
2. 消费已收到的意图，校验并转换为合法游戏命令。
3. 执行玩家输入、个体移动、战斗、恢复、资源与施工/孵育。
4. 按确定顺序处理群体、来客阶段和资源配额；每 1 秒更新感知与计划机会。
5. 记录实际事件、扣费、掉落、群体关系变化和安居中断。
6. 判定引导、考验与胜利；更新下一请求槽描述。
7. 渲染读取结果；tick 结束之后由外层启动异步 HTTP 和必要检查点写入。

纯规则函数不得 await 网络；Provider 结果不得携带整个旧快照写回。异步保存只提交同一个已冻结检查点及其事件边界，不拼接不同 tick 的 state 和 events。

## 9. 配置与运行模式

拟定服务端配置：`ECOLOGY_MODE=rule|mock|model`、provider/base URL/model、单请求 timeout、输入输出预算、会话和全局请求预算。密钥从服务进程环境读取，不进入 Vite 的客户端环境、localStorage、IndexedDB、导出存档或日志。

`rule`：不发生模型调用，可完整通关。`mock`：固定合法/非法/延迟/乱序响应，供契约测试。`model`：按 [02](02-ecology-agents-and-scheduling.md) 的真实预算调用。模式差异在开发面板中可见；普通游戏 UI 不出现技术调用流程。

模型输出、导入存档中的名字、遭遇描述等都按不可信文本处理；公开文案用文本节点或既有转义函数，不作为 HTML、脚本、文件路径或系统提示执行。服务端不接受浏览器传入的任意供应商 URL，防止借游戏接口访问任意网络目标。

首版匿名单机不需要邮箱、账号身份、真实地理位置或其它应用数据。模型请求仅包含本局必要生态观察。未来若引入跨设备存档或公开排行榜，需要另行设计认证、数据留存与游戏权威。
