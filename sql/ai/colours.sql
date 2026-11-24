-- Run once per dump, at build time: sort each distinct vinyl colour phrase into a plain colour.
-- 85k ways of describing vinyl colour collapse to these; the effect (splatter, marbled...) is left to plain SQL.
SELECT phrase,
       aiClassify(concat('Colour description of a vinyl record: ', phrase, '. If it names more than one colour, ',
                         'the main colour is the base colour, usually the first one named. Its main colour is'),
                  ['black', 'white', 'clear', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink',
                   'brown', 'grey', 'gold', 'silver', 'multicolour', 'not a colour'],
                  map('credentials', 'ollama_text')) AS colour
FROM file('data/ai/colour_phrases.tsv', TSV, 'phrase String')
SETTINGS ai_function_max_api_calls_per_query = 5000
