// Runnable against the live API with the public demo key:
//
//   node examples/demo.mjs
//
// The demo key reads only the fictional Kalvenor sample account (account id "sample").
// Kalvenor is fictional sample data. With your own key, set BROADCASTWELL_API_KEY and
// the client reads your account through /accounts/me.
//
// Calls are spaced out to stay well under the demo limit of 30 requests a minute.

import { createClient, DEMO_KEY, ENGINES, BroadcastwellApiError } from '../src/index.mjs';

const apiKey = process.env.BROADCASTWELL_API_KEY || DEMO_KEY;
const client = createClient({ apiKey });
const pause = () => new Promise((resolve) => setTimeout(resolve, 2500));

// "13 of 50 answers named the brand, 26.0% (95% interval 15.9 to 39.6)"
function sentence(rate, what) {
  if (!rate) return 'no scored answers';
  return `${rate.base} ${what}, ${rate.pct.toFixed(1)}% (95% interval ${rate.interval})`;
}

try {
  const me = await client.getMe();
  console.log(`Key: ${JSON.stringify(me.data)}`);
  console.log(`Reading account "${client.account}"${client.account === 'sample' ? ' (fictional Kalvenor sample data)' : ''}.\n`);
  await pause();

  const runs = await client.listRuns({ limit: 10 });
  console.log(`Runs (${runs.pagination.total}):`);
  for (const run of runs.data) console.log(`  ${run.run_id}  ${run.kind}  ${run.status}  method ${run.method_version}`);
  const run = runs.data.find((r) => r.kind === 'diagnostic') || runs.data[0];
  await pause();

  const summary = await client.getRunSummary({ run: run.run_id });
  const scheduled = summary.data.scheduled || {};
  console.log(`\nRun ${run.run_id}, scheduled passes only:`);
  console.log(`  ${sentence(scheduled.named_rate, 'named the brand')}`);
  console.log(`  ${sentence(scheduled.cited_rate, 'cited the brand\'s own domain')}`);
  await pause();

  console.log('\nFirst questions:');
  const questions = await client.listQuestions({ run: run.run_id, limit: 3 });
  for (const q of questions.data) {
    console.log(`  Q${q.question_id} ${q.question_text}`);
    console.log(`     ${sentence(q.named_rate, 'named the brand')}`);
  }
  await pause();

  const receipts = await client.listReceipts({
    run: run.run_id,
    engine: 'perplexity',
    verdict: 'not_named',
    limit: 2,
  });
  console.log(`\n${ENGINES.perplexity} answers that did not name the brand (${receipts.pagination.total} in total), first two:`);
  for (const r of receipts.data) {
    console.log(`  ${r.receipt_id}  Q${r.question_id}  named instead: ${(r.competitors_found || []).join(', ') || 'none recorded'}`);
  }
  await pause();

  console.log('\nEvery source cited, following pagination.next_cursor:');
  let count = 0;
  for await (const source of client.paginate('listSources', { run: run.run_id, limit: 100 })) {
    if (count < 5) console.log(`  ${source.times_cited}x  ${source.url}`);
    count++;
  }
  console.log(`  ${count} sources in total.`);
} catch (err) {
  if (err instanceof BroadcastwellApiError) {
    console.error(`API error ${err.status} ${err.code}: ${err.detail}`);
    if (err.retryAfter) console.error(`Retry after ${err.retryAfter} s.`);
    process.exitCode = 1;
  } else {
    throw err;
  }
}
