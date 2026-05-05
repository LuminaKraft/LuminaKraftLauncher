import { supabase } from './src/services/supabaseClient.js';
async function run() {
  const { data, error } = await supabase.from('modpacks').select('*').limit(1);
  if (error) console.error(error);
  console.log(Object.keys(data[0] || {}));
}
run();
