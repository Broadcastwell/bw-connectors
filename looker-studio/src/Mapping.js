// Broadcastwell Looker Studio connector: API JSON to rows.
// Pure functions with no Apps Script services, so the tests run them in Node.
// Numbers pass through exactly as the API sends them. Every rate becomes five
// columns (pct, low, high, interval, base) next to its integer counts.
// MIT licence, see LICENSE at the repository root.

var BwMap = (function () {
  function engineLabel(id) {
    var labels = BroadcastwellRoutes.ENGINES;
    return id && Object.prototype.hasOwnProperty.call(labels, id) ? labels[id] : '';
  }

  function num(value) {
    return typeof value === 'number' && isFinite(value) ? value : null;
  }

  function text(value) {
    return value === undefined || value === null ? '' : String(value);
  }

  // '2026-07-12' or '2026-07-12T08:03:00.000Z' to '20260712' (YEAR_MONTH_DAY).
  function ymd(value) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text(value));
    return m ? m[1] + m[2] + m[3] : null;
  }

  // Splits a rate object {pct, low, high, interval, base} into five columns.
  function splitRate(row, prefix, rate) {
    var r = rate && typeof rate === 'object' ? rate : {};
    row[prefix + '_pct'] = num(r.pct);
    row[prefix + '_low'] = num(r.low);
    row[prefix + '_high'] = num(r.high);
    row[prefix + '_interval'] = text(r.interval);
    row[prefix + '_base'] = text(r.base);
    return row;
  }

  // History: GET /accounts/{account}/history. One row per point.
  function history(body) {
    var rows = [];
    var segments = body && Array.isArray(body.data) ? body.data : [];
    segments.forEach(function (seg) {
      var seriesLabels = {};
      (seg.series || []).forEach(function (s) { seriesLabels[s.series] = s.label; });
      var moves = {};
      var breaks = {};
      (seg.steps || []).forEach(function (step) {
        if (step.type === 'comparison' && step.to) {
          moves[step.to.run_id + '/' + step.to.pass_id] = step.label;
        } else if (step.type === 'method_break') {
          breaks[step.after] = true;
        }
      });
      var isEngine = seg.scope === 'engine';
      (seg.points || []).forEach(function (p) {
        var row = {
          scope: text(seg.scope),
          segment_key: text(seg.key),
          segment_label: text(seg.label),
          engine_id: isEngine ? text(seg.key) : '',
          engine_label: isEngine ? engineLabel(seg.key) || text(seg.label) : '',
          run_id: text(p.run_id),
          pass_id: text(p.pass_id),
          pass_kind: text(p.pass_kind),
          observed_on: ymd(p.observed_on),
          method_version: text(p.method_version),
          series: num(p.series),
          series_label: text(seriesLabels[p.series]),
          movement: text(moves[p.run_id + '/' + p.pass_id]),
          method_break_before: breaks[p.pass_id] === true,
          observed: num(p.observed),
          excluded: num(p.excluded),
          named: num(p.named),
          scored: num(p.scored),
        };
        rows.push(splitRate(row, 'named', p.named_rate));
      });
    });
    return rows;
  }

  function summaryRow(base, group, type, key, label, block) {
    var row = {
      run_id: base.run_id,
      run_kind: base.run_kind,
      method_version: base.method_version,
      question_count: base.question_count,
      pass_group: group,
      segment_type: type,
      segment_key: key,
      segment_label: label,
      engine_id: type === 'engine' ? key : '',
      engine_label: type === 'engine' ? engineLabel(key) || label : '',
      observed: num(block.observed),
      scored: num(block.scored),
      excluded: num(block.excluded),
      named: num(block.named),
      own_domain_cited: num(block.own_domain_cited),
      questions_with_a_mention: null,
      questions_total: null,
    };
    splitRate(row, 'named', block.named_rate);
    splitRate(row, 'cited', block.cited_rate);
    return row;
  }

  // Run summary: GET /accounts/{account}/runs/{run}/summary.
  // Rows: overall, one per engine, one per question type, all from scheduled passes.
  // The adaptive block is never added in. With includeAdaptive it becomes its own
  // row, pass group "Adaptive (shown separately)".
  function summary(body, includeAdaptive) {
    var d = body && body.data ? body.data : {};
    var s = d.scheduled || {};
    var base = {
      run_id: text(d.run_id),
      run_kind: text(d.kind),
      method_version: text(d.method_version),
      question_count: num(d.question_count),
    };
    var rows = [];
    var overall = summaryRow(base, 'Scheduled', 'overall', 'overall', 'All questions and engines', s);
    if (s.questions_with_a_mention) {
      overall.questions_with_a_mention = num(s.questions_with_a_mention.count);
      overall.questions_total = num(s.questions_with_a_mention.of);
    }
    rows.push(overall);
    var engines = s.per_engine || {};
    var order = BroadcastwellRoutes.ENGINE_IDS.filter(function (id) { return engines[id]; });
    Object.keys(engines).forEach(function (id) { if (order.indexOf(id) < 0) order.push(id); });
    order.forEach(function (id) {
      rows.push(summaryRow(base, 'Scheduled', 'engine', id, text(engines[id].label), engines[id]));
    });
    var types = s.per_question_type || {};
    Object.keys(types).forEach(function (key) {
      rows.push(summaryRow(base, 'Scheduled', 'question_type', key, text(types[key].label), types[key]));
    });
    if (includeAdaptive && d.adaptive) {
      rows.push(summaryRow(base, 'Adaptive (shown separately)', 'adaptive', 'adaptive', text(d.adaptive.label), d.adaptive));
    }
    return rows;
  }

  var STATUS_LABELS = { named: 'Named', checked_not_found: 'Checked, not found' };

  // Named instead: items from GET /accounts/{account}/runs/{run}/displacement.
  // One row per question and competitor.
  function displacement(items, runId) {
    var rows = [];
    (items || []).forEach(function (q) {
      var common = {
        run_id: text(runId),
        question_id: num(q.question_id),
        question_text: text(q.question_text),
        question_type: text(q.question_type),
        checklist: text(q.checklist),
        question_scored: num(q.scored),
        client_named: num(q.client_named),
        client_absent: num(q.client_absent),
      };
      var competitors = q.competitors && q.competitors.length ? q.competitors : [null];
      competitors.forEach(function (c) {
        var row = Object.assign({}, common);
        row.competitor = c ? text(c.name) : '';
        row.competitor_status = c ? text(STATUS_LABELS[c.status] || c.status) : '';
        row.competitor_checked_in = c ? num(c.checked_in) : null;
        row.competitor_named = c ? num(c.named) : null;
        row.competitor_named_instead = c ? num(c.named_instead) : null;
        rows.push(row);
      });
    });
    return rows;
  }

  // Sources: items from GET /accounts/{account}/runs/{run}/sources. One row per cited page.
  function sources(items, runId) {
    return (items || []).map(function (s) {
      var engines = Array.isArray(s.engines) ? s.engines : [];
      var questions = Array.isArray(s.question_ids) ? s.question_ids : [];
      return {
        run_id: text(runId),
        url: text(s.url),
        domain: text(s.domain),
        own_domain: s.own_domain === true,
        engine_ids: engines.map(function (e) { return e.id; }).join(', '),
        engine_labels: engines.map(function (e) { return engineLabel(e.id) || e.label; }).join(', '),
        question_ids: questions.join(', '),
        times_cited: num(s.times_cited),
        engine_count: engines.length,
        question_count: questions.length,
        answers_naming_client: num(s.answers_naming_client),
        receipt_count: Array.isArray(s.receipt_ids) ? s.receipt_ids.length : null,
      };
    });
  }

  function alertSide(row, prefix, side) {
    var s = side || {};
    row[prefix + '_run_id'] = text(s.run_id);
    row[prefix + '_pass_id'] = text(s.pass_id);
    row[prefix + '_observed_on'] = ymd(s.observed_on);
    row[prefix + '_named'] = num(s.named);
    row[prefix + '_scored'] = num(s.scored);
    splitRate(row, prefix + '_named', s.named_rate);
  }

  // Alerts: items from GET /accounts/{account}/alerts. One row per alert.
  function alerts(items) {
    return (items || []).map(function (a) {
      var row = {
        alert_id: text(a.alert_id),
        rule: text(a.rule),
        scope: text(a.scope),
        segment_key: text(a.key),
        segment_label: text(a.label),
        engine_label: a.scope === 'engine' ? engineLabel(a.key) || text(a.label) : '',
        direction: text(a.direction),
        observed_on: ymd(a.observed_on),
        statement: text(a.statement),
        receipts_api_url: a.links && a.links.receipts ? text(a.links.receipts) : '',
      };
      alertSide(row, 'from', a.from);
      alertSide(row, 'to', a.to);
      return row;
    });
  }

  // Picks the newest delivered run that has at least one scheduled pass.
  function latestRunId(runs) {
    var best = null;
    (runs || []).forEach(function (r) {
      var scheduled = (r.passes || []).some(function (p) { return p.scheduled === true; });
      if (!scheduled || (r.status && r.status !== 'delivered')) return;
      var when = text(r.completed_at || r.created_at);
      if (!best || when > best.when) best = { id: r.run_id, when: when };
    });
    return best ? best.id : null;
  }

  // Turns row objects into Looker Studio rows holding only the requested fields, in order.
  function toValues(rows, ids, types) {
    return rows.map(function (row) {
      return {
        values: ids.map(function (id) {
          var v = row[id];
          var t = types ? types[id] : undefined;
          if (v === undefined || v === null) return t === 'NUMBER' || t === 'YEAR_MONTH_DAY' ? null : t === 'BOOLEAN' ? false : '';
          return v;
        }),
      };
    });
  }

  return {
    engineLabel: engineLabel,
    ymd: ymd,
    splitRate: splitRate,
    history: history,
    summary: summary,
    displacement: displacement,
    sources: sources,
    alerts: alerts,
    latestRunId: latestRunId,
    toValues: toValues,
  };
})();
