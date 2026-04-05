export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { imageBase64, imageMime, projectType, engine, aiProvider } = req.body;
  if (!imageBase64 || !projectType || !engine || !aiProvider) {
    return res.status(400).json({ error: 'Faltan datos requeridos' });
  }

  const engineGuides = {
    gemini: `Motor: Gemini (Nano Banana Pro).
- Descripciones largas en lenguaje natural fluido, sin parámetros especiales
- Estructura: "A photorealistic architectural render of [descripción], shot with a [lente], [hora], [iluminación], [materiales], [entorno]"`,
    midjourney: `Motor: Midjourney v6.1.
- Palabras clave separadas por comas
- Parámetros al final: --ar 16:9 --v 6.1 --q 2 --style raw
- Agregar: "architectural visualization, photorealistic, 8k, octane render"
- Negativos con --no [elemento] al final`,
    dalle: `Motor: DALL-E 3 (ChatGPT).
- Descripciones en lenguaje natural en prosa
- "A highly detailed architectural photograph of..."
- Incluir punto de vista: "from street level", "eye-level perspective"`,
    sdxl: `Motor: Stable Diffusion XL.
- Tags separados por comas en orden de importancia
- Incluir: "masterpiece, best quality, ultra detailed, 8k uhd, photorealistic"
- Generar negative prompt separado`,
    flux: `Motor: Flux (Black Forest Labs).
- Lenguaje natural detallado pero conciso (máx 200 palabras)
- Estructura: descripción del edificio → entorno → iluminación → estilo fotográfico`
  };

  const projectContext = {
    exterior: "FACHADA o EXTERIOR: volumetría, fachada, materiales exteriores, contexto urbano, paisajismo, iluminación exterior.",
    interior: "ESPACIO INTERIOR: distribución espacial, materiales, iluminación natural y artificial, mobiliario, atmósfera, profundidad de campo.",
    rural: "ARQUITECTURA RURAL: integración con el paisaje, vegetación, materiales naturales, luz natural, clima y atmósfera rural."
  };

  const systemPrompt = `Eres un experto en arquitectura, visualización 3D y prompts para IAs generadoras de imagen.

TIPO DE PROYECTO: ${projectContext[projectType]}

MOTOR DE IMAGEN SELECCIONADO Y SUS REGLAS:
${engineGuides[engine]}

Tu tarea:
1. Analizar brevemente la imagen (materiales, estilo, volumetría, contexto)
2. Generar UN prompt principal altamente optimizado para este motor
3. Generar una variante alternativa (diferente ángulo o momento del día)

Responde SOLO con JSON válido, sin backticks ni texto fuera del JSON:
{
  "analysis": "2-3 oraciones en español sobre lo que ves",
  "prompt_main": "prompt principal optimizado",
  "prompt_alt": "prompt alternativo con diferente ángulo o iluminación",
  "negative_prompt": "solo para SDXL, sino string vacío",
  "tips": ["tip 1 específico para este motor", "tip 2", "tip 3"]
}`;

  try {
    let result;

    if (aiProvider === 'anthropic') {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) throw new Error('ANTHROPIC_API_KEY no configurada en Vercel');
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1200,
          system: systemPrompt,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: imageMime || 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: 'Analizá esta imagen y generá los prompts.' }
          ]}]
        })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message || 'Error Anthropic API');
      result = d.content.map(b => b.text || '').join('');
    }

    else if (aiProvider === 'openai') {
      const key = process.env.OPENAI_API_KEY;
      if (!key) throw new Error('OPENAI_API_KEY no configurada en Vercel');
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
          model: 'gpt-4o',
          max_tokens: 1200,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: [
              { type: 'image_url', image_url: { url: `data:${imageMime || 'image/jpeg'};base64,${imageBase64}` } },
              { type: 'text', text: 'Analizá esta imagen y generá los prompts.' }
            ]}
          ]
        })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message || 'Error OpenAI API');
      result = d.choices[0].message.content;
    }

    else if (aiProvider === 'gemini') {
      const key = process.env.GEMINI_API_KEY;
      if (!key) throw new Error('GEMINI_API_KEY no configurada en Vercel');
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts: [
            { inline_data: { mime_type: imageMime || 'image/jpeg', data: imageBase64 } },
            { text: 'Analizá esta imagen y generá los prompts.' }
          ]}],
          generationConfig: { maxOutputTokens: 1200 }
        })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message || 'Error Gemini API');
      result = d.candidates[0].content.parts.map(p => p.text || '').join('');
    }

    else {
      throw new Error('AI provider no reconocido');
    }

    const clean = result.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return res.status(200).json(parsed);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
