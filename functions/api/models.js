/* Cloudflare Pages Function: GET /api/models
 * 返回前端可用的模型清单，前端据此动态渲染模型芯片。
 * GPT 模型清单由环境变量 GPT_MODELS（逗号分隔）驱动，后台增删即可，无需改代码。
 * 同时返回 gptConfigured 标记（是否已配置 GPT_API_KEY），未配置时前端会给出提示。
 */

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

export async function onRequestGet(context) {
  const { env } = context;

  const gptModels = (env.GPT_MODELS || env.OPENAI_MODELS || 'gpt-6-luna,gpt-6-sol,gpt-6-astra')
    .split(',').map(function (s) { return s.trim(); }).filter(Boolean);

  const all = [
    { id: 'gemini-3.6-flash', pv: 'Google' },
    { id: 'gemini-3.8-flash', pv: 'Google' },
    { id: 'deepseek-flash', pv: 'DeepSeek' },
    { id: 'deepseek-v4-pro', pv: 'DeepSeek' }
  ].concat(gptModels.map(function (id) { return { id: id, pv: 'OpenAI' }; }));

  // 去重（GPT_MODELS 若与内置清单重复）
  const seen = {};
  const models = all.filter(function (m) {
    if (seen[m.id]) return false;
    seen[m.id] = true;
    return true;
  });

  return json({
    models: models,
    gptConfigured: !!(env.GPT_API_KEY || env.OPENAI_API_KEY)
  });
}
