/**
 * Gemini Model Checker
 * Lists all models supported by the provided Gemini API key.
 */

const API_KEY = 'AIzaSyA15tnyVEUu7OgQIATtMM5Dk1psF76id_g';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;

async function listModels() {
  try {
    console.log('Fetching Gemini models...');
    const response = await fetch(API_URL);
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API Error ${response.status}: ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    
    if (!data.models || !Array.isArray(data.models)) {
      console.log('No models found or unexpected response format.');
      return;
    }

    console.log('\nSupported Gemini Models:');
    console.log('------------------------');
    
    // Sort models by name for better readability
    const sortedModels = data.models.sort((a, b) => a.name.localeCompare(b.name));

    sortedModels.forEach(model => {
      const name = model.name.replace('models/', '');
      console.log(`- ${name.padEnd(40)} | ${model.displayName}`);
    });

    console.log(`\nTotal models found: ${data.models.length}`);
  } catch (error) {
    console.error('Error fetching models:', error.message);
  }
}

listModels();
