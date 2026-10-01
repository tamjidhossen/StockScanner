import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_API;

if (!apiKey) {
  console.error('ERROR: No GEMINI_API or GEMINI_API_KEY found in .env');
  process.exit(1);
}

async function listModels() {
  console.log(`Checking available Gemini models with API key: ${apiKey.slice(0, 10)}...`);

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.error) {
      console.error('API Error:', data.error);
      return;
    }

    const models = data.models || [];
    console.log(`\nFound ${models.length} available models:\n`);

    // Filter models supporting generateContent
    const contentModels = models.filter((m) =>
      m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent')
    );

    console.log('--- Models supporting generateContent ---');
    for (const m of contentModels) {
      const shortName = m.name.replace('models/', '');
      console.log(`  • ${shortName.padEnd(30)} (v${m.version || '1'}, inputLimit: ${m.inputTokenLimit})`);
    }
  } catch (err) {
    console.error('Failed to list models:', err.message);
  }
}

listModels();
