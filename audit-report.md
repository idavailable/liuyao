# 代码审计报告：六爻排盘工具

- **审计日期**：2026-10-18
- **审计范围**：业务逻辑、代码逻辑、稳定性
- **审计对象**：排盘引擎（`public/core/`）、后端 API（`functions/api/`）、前端应用（`public/`）、配置层（`wrangler.toml`、`public/_headers`、`schema.sql`）

---

## 一、总体结论

**这是一个质量显著高于平均水平的代码库。未发现高危或阻断性缺陷。**

核心算法的正确性有强保障体系：

- 12,144 项古籍卦例断言（《增删卜易》207 例 + 《卜筮正宗》197 例）
- 三库交叉差分：104,780 个字段三方零差异（@taoracle/najia、iching-shifa、lunar-javascript）
- 41 类变异自检（证明"全绿"非空转）
- 注释中完整记录了历史 bug 的根因（如"静默错排比报错危险"、"`__proto__` 键静默消失"、"幽灵音符"），说明维护者对失效模式有系统性认知

审计方式：除逐文件代码审查外，对核心算法做了**手工独立验算**（不依赖项目自证）。

---

## 二、核心业务逻辑验证（手工复核通过）

| 验证项 | 结论 | 位置 |
|---|---|---|
| 京房八宫变爻表 `variants` | ✅ 手工推演乾宫全链：姤 `[0]` → 晋 `[0,1,2,4]`（游魂）→ 大有 `[4]`（归魂）；世爻位 `shiPos=[5,0,1,2,3,4,3,2]` 正确 | `public/core/paipan.js` L42-L56 |
| 纳甲表 | ✅ 抽查乾/坤/坎/离，内外卦干支装配正确 | `public/core/data.js` L19-L28 |
| 日柱锚点 | ✅ JDN(1949,10,1)=2433191，`(2433191+49)%60=0` 即甲子，校准正确 | `public/core/calendar.js` L90-L93 |
| 月支映射 | ✅ `m%12`（1月→丑、2月→寅、12月→子），以十二节交节分钟级时刻为界 | `public/core/calendar.js` L97-L104 |
| 年柱立春分界 | ✅ 表外年份降级有 `APPROX_TERM_DAY` 近似且不崩溃 | `public/core/calendar.js` L107-L124 |
| 时柱 | ✅ `floor((h+1)/2)%12`：23 点与 0 点同属子时 | `public/core/calendar.js` L157 |
| 旬空 | ✅ `xunStart%12` 起 +10/+11：甲子旬空戌亥、甲戌旬空申酉，正确 | `public/core/calendar.js` L162-L165 |
| 六冲/六合卦 | ✅ 三对地支（初四/二五/三上）直推，不查卦名表，定义完备 | `public/core/paipan.js` L65-L79 |
| 摇卦熵源 | ✅ `crypto.getRandomValues` 取字节最低位，0/1 均匀分布；降级 `Math.random` 有警告 | `public/app.js` L74-L84 |
| 夜子时流派 | ✅ `'day'` 流派时干按次日日干五鼠遁（正法），`'next'` 流派整体进位，两库实证一致 | `public/core/calendar.js` L142-L161 |
| SQL 注入防护 | ✅ 全部参数化查询，id 白名单 `^[A-Za-z0-9_-]{1,64}$` 读写双路径校验 | `functions/api/records.js` L28 |
| 结果回执白名单 | ✅ `result`/`yingqi` 枚举校验 + `note` 限长 200 字 | `functions/api/records.js` L150-L160 |

---

## 三、发现的问题

### 中危

#### M1. BGM 后台空转重试

- **位置**：`public/bgm.js` L113-L114
- **问题**：`phrase()` 在 `ctx.state !== 'running'` 时以 1.2s 间隔 `setTimeout` 自旋重试。页面隐藏时 `visibilitychange` 会 `ctx.suspend()`，此后定时器在后台持续空转（浏览器虽节流至分钟级，但设计意图是暂停而非轮询），造成无谓的定时器活动。
- **建议**：`visibilitychange` 隐藏时一并 `clearTimeout(timer)`，恢复可见时重启 `phrase()`。改动约 3 行。

#### M2. 访问口令明文存于 localStorage

- **位置**：`public/app.js` L1451（`ly_access_code`）
- **问题**：口令明文持久化。一旦任意 XSS 得手即可窃取口令，进而读取全部卦例（含隐私问事内容）。
- **现状缓解**：CSP `connect-src 'self'` 阻断外泄通道；全部动态内容经 `esc()/escAttr()` 转义；`parseOutcome` 对 D1 历史数据做了 `pick()` 防原型链污染。属知情取舍。
- **建议**（可选）：改用 `sessionStorage`（关标签页即失效），或存储口令的派生哈希而非明文。

### 低危

#### L1. 请求体无总大小上限

- **位置**：`functions/api/interpret.js` L194、`functions/api/records.js` L226
- **问题**：`await request.json()` 对任意大的 body 先全量读入内存，之后才做字段级限长（`panText` 上限、`jsonWithin` 收缩）。CF Workers 有平台级请求体上限兜底，但恶意大 JSON 会先耗 isolate 内存。
- **建议**：解析前检查 `Content-Length` 头并显式拒绝超限请求（如 >512KB 直接 413）。

#### L2. 卦例列表无分页

- **位置**：`functions/api/records.js` L196
- **问题**：`LIMIT 100` 硬编码，超出后旧记录仅能通过 id 直访，列表不可见。
- **现状**：个人使用规模下可接受；`created_at DESC` 索引已建，加分页成本低。

#### L3. 敏感词子串匹配存在语义误拦面

- **位置**：`public/core/sensitive.js` L55-L60
- **问题**：纯子串匹配，如「自杀式降价」「病危通知书模板设计」会误命中 block 档。
- **现状**：误拦方向是保守的（宁可误拦不可漏拦），README 已明确声明该取舍，词表刻意收窄避开裸「生」「生产」等高频歧义词，且有防回归断言。符合设计原则，**不建议改**。

#### L4. 限流不跨 isolate

- **位置**：`functions/api/interpret.js` L62-L95
- **问题**：模块级 `Map` 在 CF Workers 多 isolate 间不共享，单 IP 实际限额 ≈ 配置值 × 活跃 isolate 数。
- **现状**：注释已明确声明此为"成本抑制兜底，非安全边界"，且生产当前未启用（`RATE_LIMIT_PER_MIN` 注释于 `wrangler.toml`）。定位准确，**无需修**。

---

## 四、信息级（设计确认，非缺陷）

| 项 | 说明 |
|---|---|
| `beijingNow()` 的 UTC+8 平移 hack（`app.js` L50-L54） | 内部时间戳失真，但 `fourPillars` 只读本机 getters、UI 展示与输入框同源，业务自洽。DST 切换瞬间的边缘偏差不影响四柱计算 |
| `_headers` CSP 保留 `unsafe-inline` | 注释完整说明（CF Bot Management 注入内联脚本所需）；`connect-src 'self'` 与 `script-src 'self'` 兜住外联与回传，是真正的防线 |
| `ON CONFLICT` 只更新 `question/messages` | 刻意设计：自动保存不得冲掉已回填的 outcome，回执回填也不改卦例本体，两路径更新清单互不包含 |
| `bian` 字段对静爻也给出变卦同位纳甲 | 刻意的 API 语义（古籍排盘表右半对静爻位同样印出纳甲），消费侧均先判 `moving`，测试层有契约锁定 |
| 双副本 `SYSTEM_PROMPT`（`app.js` ↔ `interpret.js`） | 已知维护点，`test-functions.mjs` 有断言守住两份提示词关键契约行一致 |

---

## 五、稳定性亮点（值得保留的做法）

1. **入参显式拒绝**：`paipan.js` L95-L110 对非法爻值/非法日期抛错而非静默错排——"静默错排比报错危险得多"体现了正确的失效哲学。
2. **流式响应双守卫**：`SSE_MAX_REPLY` 防无限拼接；计时器托管给流生命周期（`timerHandedOff`），防止 `finally` 提前注销导致上游挂起时请求无限悬挂（`interpret.js` L339-L368）。
3. **客户端断开与上游超时区分**：`clientGone` 单独标记，客户端断开时立即掐断上游且不触发跨模型降级重试，不白烧 token。
4. **常量时间口令比较**：`safeEqual` 防时序侧信道，`interpret.js` 与 `records.js` 共用同一实现。
5. **`__proto__` 污染防护**：`jsonWithin` 用 `Object.create(null)` 承载收缩结果（`records.js` L105-L109）；前端 `parseOutcome` 用 `pick()` 防原型链属性通过校验。
6. **自动保存串行化**：`autoSavePromise` 链式 then 防止并发写产生重复记录（`app.js` L1400-L1416）。
7. **代际令牌**：`opts.gen` 丢弃"用户已重新起卦"后在途旧请求的回调，防止旧响应污染新卦。
8. **上游错误不外泄**：LLM 原始错误体只进服务端日志，不回传客户端，防中转站回显请求头或 key。
9. **BGM 幽灵音符修复**：`stop()` 真正 `src.stop()` 已排程音源，而非仅拉低 master gain。
10. **永不截断 JSON 文本**：`jsonWithin` 按结构收缩而非 `slice`，保证写入 D1 的永远是合法 JSON。

---

## 六、修复优先级建议

| 优先级 | 项 | 动作 |
|---|---|---|
| P1 | M1 BGM 后台空转 | 立即修复（约 3 行） |
| P2 | M2 口令明文存储 | backlog，可选 |
| P2 | L1 请求体总大小上限 | backlog |
| P3 | L2 列表分页 | 随使用量增长再议 |
| — | L3 / L4 | 知情取舍，不处理 |

---

*审计方法说明：本报告除代码走查外，对排盘核心算法（京房八宫变爻次序、纳甲装配、JDN 日柱锚点、旬空计算）做了独立手工验算，未依赖项目自带测试体系的结论。*
