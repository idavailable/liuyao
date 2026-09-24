/* Cloudflare Pages Function: POST /api/interpret
 * 排盘文本 + 对话历史 → 大模型断卦
 * 环境变量（Pages 项目设置中配置）：
 *   LLM_API_KEY    必填，大模型 API Key（服务端保管，页面不可见）
 *   LLM_BASE_URL   选填，默认 https://api.deepseek.com/v1（OpenAI 兼容接口均可；
 *                  若指向 generativelanguage.googleapis.com 则自动改用 Google 原生 generateContent 协议）
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
  // Google 原生接口（generativelanguage.googleapis.com 或 AI Gateway 的 google-ai-studio 原生路径）
  // 走 generateContent + x-goog-api-key，并关闭 thinking（思考路径常因 high demand 503）；
  // 其余（含 Gateway 的 /openai 兼容路径、DeepSeek 等）按 OpenAI 兼容接口处理
  const isGoogle = base.indexOf('generativelanguage.googleapis.com') !== -1 ||
    (base.indexOf('google-ai-studio') !== -1 && base.slice(-7) !== '/openai');

  const messages = [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: panText }];
  history.forEach(function (m) {
    if (m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content) {
      messages.push({ role: m.role, content: m.content.slice(0, 4000) });
    }
  });

  let url, headers, payload;
  if (isGoogle) {
    url = base + '/models/' + encodeURIComponent(model) + ':generateContent';
    headers = { 'x-goog-api-key': env.LLM_API_KEY, 'Content-Type': 'application/json' };
    const contents = messages.filter(function (m) { return m.role !== 'system'; }).map(function (m) {
      return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] };
    });
    payload = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: contents,
      generationConfig: { temperature: 0.3, thinkingConfig: { thinkingBudget: 0 } }
    };
  } else {
    url = base + '/chat/completions';
    headers = { 'Authorization': 'Bearer ' + env.LLM_API_KEY, 'Content-Type': 'application/json' };
    payload = { model: model, messages: messages, temperature: 0.3, stream: false };
  }

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });
    if (!resp.ok) {
      const t = await resp.text();
      return json({ error: 'LLM_ERROR', message: '大模型接口返回 ' + resp.status, detail: t.slice(0, 500) }, 502);
    }
    const data = await resp.json();
    let reply = '';
    if (isGoogle) {
      const cand = data.candidates && data.candidates[0];
      const parts = cand && cand.content && cand.content.parts;
      if (parts) reply = parts.map(function (p) { return p.text || ''; }).join('');
    } else {
      const choice = data.choices && data.choices[0];
      reply = choice && choice.message ? (choice.message.content || '') : '';
    }
    if (!reply) return json({ error: 'EMPTY', message: '大模型返回为空' }, 502);
    return json({ reply: reply, model: model });
  } catch (e) {
    return json({ error: 'NET_ERROR', message: '无法连接大模型服务：' + e.message }, 502);
  }
}
