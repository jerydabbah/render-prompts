export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { imageBase64, imageMime, projectType, engine } = req.body;
  if (!imageBase64 || !projectType || !engine) {
    return res.status(400).json({ error: 'Faltan datos requeridos' });
  }

  const engineGuides = {
    gemini: `Motor: Gemini (Nano Banana Pro).
- Soporta descripciones largas en lenguaje natural fluido
- No usar parámetros especiales ni símbolos como --
- Incluir cámara, lente, hora del día, materiales y atmósfera en prosa
- Estructura: "A photorealistic architectural render of [descripción], shot with a [lente], [hora], [iluminación], [materiales], [entorno]"`,
    midjourney: `Motor: Midjourney v6.1.
- Palabras clave separadas por comas, no frases largas
- Parámetros al final: --ar 16:9 --v 6.1 --q 2 --style raw
- Agregar: "architectural visualization, photorealistic, 8k, octane render"
- Negativos con --no [elemento] al final`,
    dalle: `Motor: DALL-E 3 (ChatGPT).
- Descripciones en lenguaje natural, detalladas y en prosa
- "A highly detailed architectural photograph of..."
- Incluir punto de vista: "from street level", "eye-level perspective"
- Ser muy concreto sobre materiales, colores y texturas`,
    sdxl: `Motor: Stable Diffusion XL.
- Tags separados por comas en orden de importancia
- Incluir: "masterpiece, best quality, ultra detailed, 8k uhd, photorealistic"
- Generar negative prompt: "blurry, distorted, low quality, deformed"
- Usar paréntesis para peso: (detailed facade:1.3)`,
    flux: `Motor: Flux (Black Forest Labs).
- Lenguaje natural detallado pero conciso (máx 200 palabras)
- Muy bueno con texturas y realismo fotográfico
- Mencionar lente, hora del día, condiciones de luz
- Estructura: descripción del edificio → entorno → iluminación → estilo fotográfico`
  };

  const projectContext = {
    exterior: "FACHADA o EXTERIOR: volumetría, fachada, materiales exteriores, contexto urbano, paisajismo, iluminación exterior.",
    interior: "ESPACIO INTERIOR: distribución espacial, materiales, iluminación natural y artificial, mobiliario, atmósfera, profundidad de campo.",
    rural: "ARQUITECTURA RURAL: integración con el paisaje, vegetación, materiales naturales, luz natural, clima y atmósfera rural."
  };

  const systemPrompt = `Eres un experto en arquitectura, visualización 3D y prompts para IAs generadoras de imagen.

TIPO DE PROYECTO: ${projectContext[projectType]}

MOTOR SELECCIONADO Y SUS REGLAS:
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
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1200,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: imageMime || 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: 'Analizá esta imagen y generá los prompts.' }
          ]
        }]
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'API error');

    const raw = data.content.map(b => b.text || '').join('').replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(raw);
    return res.status(200).json(parsed);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
