// Broadcastwell Looker Studio connector: field definitions for every data set.
// Plain data plus one builder. The builder is the only part that touches DataStudioApp.
// MIT licence, see LICENSE at the repository root.

var BwSchema = (function () {
  // Each field: [id, name, type, kind, description]
  //   type: TEXT, NUMBER, BOOLEAN, URL or YEAR_MONTH_DAY
  //   kind: 'dim', 'count' (an integer count, summed) or 'rate' (a rate figure, never summed)
  function rateFields(prefix, label) {
    return [
      [prefix + '_pct', label + ' %', 'NUMBER', 'rate', label + ' as a percentage from 0 to 100. Read it with its base and interval.'],
      [prefix + '_low', label + ' 95% low', 'NUMBER', 'rate', 'Lower end of the 95% interval, percentage points.'],
      [prefix + '_high', label + ' 95% high', 'NUMBER', 'rate', 'Upper end of the 95% interval, percentage points.'],
      [prefix + '_interval', label + ' 95% interval', 'TEXT', 'dim', 'The 95% interval as printed, for example 15.9 to 39.6.'],
      [prefix + '_base', label + ' base', 'TEXT', 'dim', 'The count behind the rate, for example 13 of 50 answers.'],
    ];
  }

  function side(prefix, label) {
    return [
      [prefix + '_run_id', label + ' run id', 'TEXT', 'dim', ''],
      [prefix + '_pass_id', label + ' pass id', 'TEXT', 'dim', ''],
      [prefix + '_observed_on', label + ' observed on', 'YEAR_MONTH_DAY', 'dim', ''],
      [prefix + '_named', label + ' named', 'NUMBER', 'count', 'Answers that named the company.'],
      [prefix + '_scored', label + ' scored', 'NUMBER', 'count', 'Answers scored.'],
    ].concat(rateFields(prefix + '_named', label + ' named rate'));
  }

  var DATASETS = {
    history: {
      label: 'History',
      runLevel: false,
      fields: [
        ['scope', 'Scope', 'TEXT', 'dim', 'account, engine or question_type.'],
        ['segment_key', 'Segment key', 'TEXT', 'dim', 'account, an engine id or a question type.'],
        ['segment_label', 'Segment', 'TEXT', 'dim', ''],
        ['engine_id', 'Engine id', 'TEXT', 'dim', 'Filled for the engine scope.'],
        ['engine_label', 'Engine', 'TEXT', 'dim', 'ChatGPT, Claude, Perplexity, Google AI Overviews or Google AI Mode. Filled for the engine scope.'],
        ['run_id', 'Run id', 'TEXT', 'dim', ''],
        ['pass_id', 'Pass id', 'TEXT', 'dim', ''],
        ['pass_kind', 'Pass kind', 'TEXT', 'dim', 'Scheduled passes only. Adaptive passes are never history points.'],
        ['observed_on', 'Observed on', 'YEAR_MONTH_DAY', 'dim', ''],
        ['method_version', 'Method version', 'TEXT', 'dim', ''],
        ['series', 'Series', 'NUMBER', 'dim', 'Points are comparable only within one series.'],
        ['series_label', 'Series label', 'TEXT', 'dim', ''],
        ['movement', 'Movement', 'TEXT', 'dim', 'Moved up or Moved down only where the two 95% intervals separate.'],
        ['method_break_before', 'Method break before', 'BOOLEAN', 'dim', 'True when the method changed before this point.'],
        ['observed', 'Observed', 'NUMBER', 'count', 'Answers observed.'],
        ['excluded', 'Excluded', 'NUMBER', 'count', 'Answers excluded from scoring.'],
        ['named', 'Named', 'NUMBER', 'count', 'Answers that named the company.'],
        ['scored', 'Scored', 'NUMBER', 'count', 'Answers scored.'],
      ].concat(rateFields('named', 'Named rate')),
    },
    summary: {
      label: 'Run summary',
      runLevel: true,
      fields: [
        ['run_id', 'Run id', 'TEXT', 'dim', ''],
        ['run_kind', 'Run kind', 'TEXT', 'dim', ''],
        ['method_version', 'Method version', 'TEXT', 'dim', ''],
        ['pass_group', 'Pass group', 'TEXT', 'dim', 'Scheduled, or Adaptive (shown separately). Headline figures are scheduled only.'],
        ['segment_type', 'Segment type', 'TEXT', 'dim', 'overall, engine, question_type or adaptive. Filter to one type before adding counts.'],
        ['segment_key', 'Segment key', 'TEXT', 'dim', ''],
        ['segment_label', 'Segment', 'TEXT', 'dim', ''],
        ['engine_id', 'Engine id', 'TEXT', 'dim', ''],
        ['engine_label', 'Engine', 'TEXT', 'dim', ''],
        ['question_count', 'Questions in run', 'NUMBER', 'count', ''],
        ['observed', 'Observed', 'NUMBER', 'count', ''],
        ['scored', 'Scored', 'NUMBER', 'count', ''],
        ['excluded', 'Excluded', 'NUMBER', 'count', ''],
        ['named', 'Named', 'NUMBER', 'count', 'Answers that named the company.'],
      ].concat(rateFields('named', 'Named rate'), [
        ['own_domain_cited', 'Own domain cited', 'NUMBER', 'count', 'Answers that cited the company domain.'],
      ], rateFields('cited', 'Own domain cited rate'), [
        ['questions_with_a_mention', 'Questions with a mention', 'NUMBER', 'count', 'Overall row only.'],
        ['questions_total', 'Questions counted', 'NUMBER', 'count', 'Overall row only.'],
      ]),
    },
    displacement: {
      label: 'Named instead',
      runLevel: true,
      fields: [
        ['run_id', 'Run id', 'TEXT', 'dim', ''],
        ['question_id', 'Question id', 'NUMBER', 'dim', ''],
        ['question_text', 'Question', 'TEXT', 'dim', ''],
        ['question_type', 'Question type', 'TEXT', 'dim', ''],
        ['checklist', 'Checklist', 'TEXT', 'dim', ''],
        ['competitor', 'Competitor', 'TEXT', 'dim', ''],
        ['competitor_status', 'Competitor status', 'TEXT', 'dim', 'Named, or Checked, not found.'],
        ['question_scored', 'Question answers scored', 'NUMBER', 'count', 'Repeats on every competitor row of the question. Use MAX, not SUM, across competitors.'],
        ['client_named', 'Answers naming the company', 'NUMBER', 'count', 'Repeats on every competitor row of the question.'],
        ['client_absent', 'Answers without the company', 'NUMBER', 'count', 'Repeats on every competitor row of the question.'],
        ['competitor_checked_in', 'Competitor checked in', 'NUMBER', 'count', 'Answers checked for this competitor.'],
        ['competitor_named', 'Competitor named', 'NUMBER', 'count', 'Answers that named this competitor.'],
        ['competitor_named_instead', 'Competitor named instead', 'NUMBER', 'count', 'Answers that named this competitor and not the company.'],
      ],
    },
    sources: {
      label: 'Sources',
      runLevel: true,
      fields: [
        ['run_id', 'Run id', 'TEXT', 'dim', ''],
        ['url', 'Cited page', 'URL', 'dim', ''],
        ['domain', 'Domain', 'TEXT', 'dim', ''],
        ['own_domain', 'Own domain', 'BOOLEAN', 'dim', 'True when the page is on the company domain.'],
        ['engine_ids', 'Engine ids', 'TEXT', 'dim', ''],
        ['engine_labels', 'Engines', 'TEXT', 'dim', 'Engines that cited the page.'],
        ['question_ids', 'Question ids', 'TEXT', 'dim', ''],
        ['times_cited', 'Times cited', 'NUMBER', 'count', 'Scheduled answers that cited the page.'],
        ['engine_count', 'Engine count', 'NUMBER', 'count', ''],
        ['question_count', 'Question count', 'NUMBER', 'count', ''],
        ['answers_naming_client', 'Answers naming the company', 'NUMBER', 'count', 'Answers citing the page that also named the company.'],
        ['receipt_count', 'Receipts', 'NUMBER', 'count', ''],
      ],
    },
    alerts: {
      label: 'Alerts',
      runLevel: false,
      fields: [
        ['alert_id', 'Alert id', 'TEXT', 'dim', ''],
        ['rule', 'Rule', 'TEXT', 'dim', ''],
        ['scope', 'Scope', 'TEXT', 'dim', ''],
        ['segment_key', 'Segment key', 'TEXT', 'dim', ''],
        ['segment_label', 'Segment', 'TEXT', 'dim', ''],
        ['engine_label', 'Engine', 'TEXT', 'dim', 'Filled for engine alerts.'],
        ['direction', 'Direction', 'TEXT', 'dim', 'up or down.'],
        ['observed_on', 'Observed on', 'YEAR_MONTH_DAY', 'dim', ''],
        ['statement', 'Statement', 'TEXT', 'dim', ''],
        ['receipts_api_url', 'Receipts API link', 'URL', 'dim', 'API address of the receipts for the later pass. Needs your key.'],
      ].concat(side('from', 'From'), side('to', 'To')),
    },
  };

  var ORDER = ['history', 'summary', 'displacement', 'sources', 'alerts'];

  function dataset(id) {
    return Object.prototype.hasOwnProperty.call(DATASETS, id) ? DATASETS[id] : null;
  }

  function fieldIds(id) {
    var d = dataset(id);
    return d ? d.fields.map(function (f) { return f[0]; }) : [];
  }

  function fieldTypes(id) {
    var out = {};
    var d = dataset(id);
    if (d) d.fields.forEach(function (f) { out[f[0]] = f[2]; });
    return out;
  }

  // Builds a DataStudioApp Fields object for one data set.
  function buildFields(cc, id) {
    var d = dataset(id);
    var fields = cc.getFields();
    var types = cc.FieldType;
    var agg = cc.AggregationType;
    d.fields.forEach(function (f) {
      var field = f[3] === 'dim' ? fields.newDimension() : fields.newMetric();
      field.setId(f[0]).setName(f[1]).setType(types[f[2]]);
      if (f[4]) field.setDescription(f[4]);
      if (f[3] === 'count') field.setAggregation(agg.SUM);
      if (f[3] === 'rate') field.setAggregation(agg.NO_AGGREGATION);
    });
    return fields;
  }

  return {
    DATASETS: DATASETS,
    ORDER: ORDER,
    dataset: dataset,
    fieldIds: fieldIds,
    fieldTypes: fieldTypes,
    buildFields: buildFields,
  };
})();
