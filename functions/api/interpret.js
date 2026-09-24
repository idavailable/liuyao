/* Cloudflare Pages Function: POST /api/interpret
 * 排盘文本 + 对话历史 → 大模型断卦
 * 环境变量（Pages 项目设置中配置）：
 *   LLM_API_KEY    必填，大模型 API Key（服务端保管，页面不可见）
 *   LLM_BASE_URL   选填，默认 https://api.deepseek.com/v1（OpenAI 兼容接口均可）
 *   LLM_MODEL      选填，默认 deepseek-chat（古籍理解建议 deepseek-chat / deepseek-reasoner）
 *   ACCESS_CODE    选填，设置后页面需输入访问口令
 */

const SYSTEM_PROMPT = [
  '你是一位精通京房纳甲六爻的卦师，治学严谨，断卦有据。',
  '收到排盘后按以下次序通盘论断：',
  '一、列卦象要点：卦名卦宫、世应、用神（按所测之事取之，两现说明取舍）、动爻及其化出、月建日辰生克、旬空月破、冲合。',
  '二、断吉凶：以旺衰生克为纲，引经据典（《增删卜易》《卜筮正宗》等），术语用规范六爻术语，不得用现代心理学术语。',
  '三、断应期：据旬空、冲合、生扶之理推断应验之时。',
  '四、白话总结：用一段简明中文给出结论与建议。',
  '若信息不足，明确指出需补充何事，不得臆造。',
  '用户后续追问时，保持卦理一致，延续断卦思路作答。'
].join('\n');

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (env.ACCESS_CODE) {
    const code = request.headers.get('X-Access-Code') || '';
    if (code !== env.ACCESS_CODE) return json({ error: 'ACCESS_REQUIRED', message: '需要访问口令' }, 401);
  }
  if (!env.LLM_API_KEY) return json({ error: 'NO_KEY', message: '服务端未配置 LLM_API_KEY 环境变量' }, 500);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'BAD_JSON', message: '请求体解析失败' }, 400); }

  const panText = (body.panText || '').toString().slice(0, 8000);
  if (!panText) return json({ error: 'NO_PAN', message: '缺少排盘文本' }, 400);
  const history = Array.isArray(body.messages) ? body.messages.slice(-20) : [];

  const base = (env.LLM_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/$/, '');
  const model = env.LLM_MODEL || 'deepseek-chat';

  const messages = [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: panText }];
  history.forEach(function (m) {
    if (m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content) {
      messages.push({ role: m.role, content: m.content.slice(0, 4000) });
    }
  });

  try {
    const resp = await fetch(base + '/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + env.LLM_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model, messages: messages, temperature: 0.3, stream: false })
    });
    if (!resp.ok) {
      const t = await resp.text();
      return json({ error: 'LLM_ERROR', message: '大模型接口返回 ' + resp.status, detail: t.slice(0, 500) }, 502);
    }
    const data = await resp.json();
    const choice = data.choices && data.choices[0];
    const reply = choice && choice.message ? (choice.message.content || '') : '';
    if (!reply) return json({ error: 'EMPTY', message: '大模型返回为空' }, 502);
    return json({ reply: reply, model: model });
  } catch (e) {
    return json({ error: 'NET_ERROR', message: '无法连接大模型服务：' + e.message }, 502);
  }
}
