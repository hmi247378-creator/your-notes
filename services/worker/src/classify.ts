import { Hono } from 'hono';
import { z } from 'zod';
import { Env } from './db.js';
import { sendData, generateId } from './utils.js';

const classify = new Hono<{ Bindings: Env; Variables: { jwtPayload: { userId: string } } }>();

classify.post('/', async (c) => {
  const userId = c.get('jwtPayload').userId;
  const { text } = await c.req.json();
  if (!text) return c.json({ error: 'Text is required' }, 400);

  // 1. Fetch user tags to provide context to AI
  const { results: tags } = await c.env.DB
    .prepare('SELECT id, name FROM Tag WHERE userId = ?')
    .bind(userId)
    .all<{ id: string; name: string }>();

  if (tags.length === 0) {
    return c.json(sendData({ suggestions: [], explain: 'No tags found for user' }));
  }

  // 2. Use Cloudflare Workers AI to suggest tags
  const prompt = `
    You are a smart note assistant. Below is a list of my tags and a new note I just wrote.
    Please suggest the most relevant tags from the list for this note.
    
    Tags:
    ${tags.map(t => `- ${t.name} (ID: ${t.id})`).join('\n')}
    
    Note Content:
    "${text}"
    
    Return ONLY a JSON array of the suggested tag IDs, ordered by relevance. If no tags fit well, return an empty array [].
    Example output: ["uuid1", "uuid2"]
  `;

  try {
    const aiResponse: any = await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: 'You are a helpful assistant that categories notes into tags.' },
        { role: 'user', content: prompt }
      ]
    });

    // Parse the AI output (handle potential Markdown wrapping)
    const content = aiResponse.response || aiResponse.choices?.[0]?.message?.content || '[]';
    const jsonMatch = content.match(/\[.*\]/s);
    const suggestedIds = JSON.parse(jsonMatch ? jsonMatch[0] : '[]');
    
    // Filter to ensure all suggested IDs actually exist for the user
    const finalIds = suggestedIds.filter((id: string) => tags.some(t => t.id === id));

    const suggestions = finalIds.map((id: string) => ({
      tagId: id,
      score: 0.9, // Constant score for now
      level: 'suggested'
    }));

    // 3. Save suggestion to DB
    const suggestionId = generateId();
    await c.env.DB
      .prepare('INSERT INTO ClassificationSuggestion (id, userId, inputText, suggestedTags, createdAt) VALUES (?, ?, ?, ?, ?)')
      .bind(suggestionId, userId, text, JSON.stringify(suggestions), new Date().toISOString())
      .run();

    return c.json(sendData({ suggestionId, suggestions, explain: 'AI generated suggestions' }));
  } catch (err: any) {
    console.error('AI Classification Error:', err);
    return c.json({ error: 'AI Classification failed', details: err.message }, 500);
  }
});

export { classify };
