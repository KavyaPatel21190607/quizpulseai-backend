const MODEL_FALLBACKS = [
  process.env.GEMINI_MODEL,
  'gemini-2.0-flash',
  'gemini-1.5-flash-latest',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
].filter(Boolean);

let cachedDiscoveredModels = [];
let lastDiscoveryAt = 0;

const normalizeModelName = (modelName) => String(modelName || '').replace(/^models\//, '').trim();

const uniqueModels = (models) => {
  const seen = new Set();
  const output = [];

  for (const model of models) {
    const normalized = normalizeModelName(model);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
  }

  return output;
};

const discoverGenerateContentModels = async () => {
  const now = Date.now();
  if (cachedDiscoveredModels.length > 0 && now - lastDiscoveryAt < 10 * 60 * 1000) {
    return cachedDiscoveredModels;
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
    process.env.GEMINI_API_KEY
  )}`;

  const response = await fetch(endpoint, { method: 'GET' });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`ListModels failed (${response.status}): ${err}`);
  }

  const payload = await response.json();
  const models = Array.isArray(payload?.models) ? payload.models : [];

  const discovered = models
    .filter((model) => Array.isArray(model?.supportedGenerationMethods) && model.supportedGenerationMethods.includes('generateContent'))
    .map((model) => normalizeModelName(model?.name))
    .filter(Boolean);

  // Prefer stronger/default chat-text models first if present.
  const priorities = [
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
  ];

  discovered.sort((a, b) => {
    const ai = priorities.findIndex((p) => a.includes(p));
    const bi = priorities.findIndex((p) => b.includes(p));
    const aRank = ai === -1 ? Number.MAX_SAFE_INTEGER : ai;
    const bRank = bi === -1 ? Number.MAX_SAFE_INTEGER : bi;
    if (aRank !== bRank) return aRank - bRank;
    return a.localeCompare(b);
  });

  cachedDiscoveredModels = uniqueModels(discovered);
  lastDiscoveryAt = now;
  return cachedDiscoveredModels;
};

const extractJsonArray = (text) => {
  if (!text || typeof text !== 'string') {
    throw new Error('Gemini returned an empty response');
  }

  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('Could not parse quiz questions from Gemini response');
  }

  return JSON.parse(jsonMatch[0]);
};

export const generateQuizWithGemini = async (quizConfig) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is missing');
    }

    const prompt = `Generate a quiz with the following specifications:
    
Subject: ${quizConfig.subject}
Grade/Class: ${quizConfig.gradeClass}
Topic: ${quizConfig.topic}
Learning Objectives: ${quizConfig.learningObjectives || 'Not specified'}
Assessment Type: ${quizConfig.assessmentType}
Difficulty Level: ${quizConfig.difficulty}
Number of Questions: ${quizConfig.numberOfQuestions}
Question Types: ${Object.keys(quizConfig.questionTypes)
      .filter((key) => quizConfig.questionTypes[key])
      .join(', ')}

For each question, provide:
1. The question text
2. The question type (multiple-choice, true-false, or short-answer)
3. For multiple-choice and true-false: provide exactly 4 options for MC and True/False for T/F
4. The correct answer
5. An explanation

Format the response as a JSON array of questions with this structure:
[
  {
    "question": "Question text here",
    "type": "multiple-choice" or "true-false" or "short-answer",
    "options": ["Option 1", "Option 2", "Option 3", "Option 4"] (only for MC/TF),
    "correctAnswer": "The correct answer",
    "explanation": "Explanation of why this is correct"
  }
]

Make sure the questions are age-appropriate for the grade level and align with the learning objectives.
Return ONLY valid JSON array with no extra text.`;

    let lastError;
    const discoveredModels = await discoverGenerateContentModels().catch(() => []);
    const modelsToTry = uniqueModels([...MODEL_FALLBACKS, ...discoveredModels]);

    for (const modelName of modelsToTry) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          normalizeModelName(modelName)
        )}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;

        const apiResponse = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: prompt }],
              },
            ],
            generationConfig: {
              temperature: 0.4,
              topP: 0.9,
              maxOutputTokens: 8192,
            },
          }),
        });

        if (!apiResponse.ok) {
          const errText = await apiResponse.text();
          throw new Error(`Gemini ${modelName} failed (${apiResponse.status}): ${errText}`);
        }

        const payload = await apiResponse.json();
        const text =
          payload?.candidates?.[0]?.content?.parts
            ?.map((part) => part?.text || '')
            .join('\n') || '';

        const questions = extractJsonArray(text);

        if (!Array.isArray(questions) || questions.length === 0) {
          throw new Error('Gemini returned empty question list');
        }

        return questions;
      } catch (modelError) {
        lastError = modelError;
      }
    }

    throw (
      lastError ||
      new Error(`No Gemini model could generate quiz content. Tried: ${modelsToTry.join(', ')}`)
    );
  } catch (error) {
    console.error('Gemini API error:', error);
    throw new Error(`Failed to generate quiz: ${error.message}`);
  }
};
