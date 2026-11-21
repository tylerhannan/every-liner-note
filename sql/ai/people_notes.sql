-- Run once per dump, at build time: a short note on each person who glues the shelf together, from their credits only.
SELECT artist_id,
       aiGenerate(concat('Write one or two short sentences of liner notes about this person, using only these facts. ',
                         'Name the records. Do not describe their style or add anything else.\n\n', facts),
                  map('credentials', 'ollama_text', 'temperature', '0.2',
                      'system_prompt', 'You write short, warm, factual liner notes about the people who make records. Use only the facts given.')) AS note
FROM file('data/ai/people_facts.jsonl', JSONEachRow, 'artist_id UInt32, facts String')
SETTINGS ai_function_max_api_calls_per_query = 100
