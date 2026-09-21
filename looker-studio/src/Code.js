// Broadcastwell Looker Studio connector: the functions Looker Studio calls.
// getAuthType, setCredentials, isAuthValid, resetAuth, getConfig, getSchema, getData.
// MIT licence, see LICENSE at the repository root.

var cc = DataStudioApp.createCommunityConnector();
var BW_KEY_PROPERTY = 'dscc.key';
var BW_HELP_URL = 'https://app.broadcastwell.com/developers';

// ---------------------------------------------------------------------------
// Auth: an API key, stored in this user's UserProperties
// ---------------------------------------------------------------------------

function getAuthType() {
  return cc.newAuthTypeResponse().setAuthType(cc.AuthType.KEY).setHelpUrl(BW_HELP_URL).build();
}

function bwStoredKey_() {
  return PropertiesService.getUserProperties().getProperty(BW_KEY_PROPERTY);
}

// True when GET /me accepts the key. Only a 401 or 403 means the key is wrong;
// other failures are reported by getData with their own message.
function bwKeyAccepted_(key, useCache) {
  try {
    BwApi.getJson(key, 'getMe', {}, { cache: useCache });
    return true;
  } catch (e) {
    if (e instanceof BwApi.HttpError && (e.status === 401 || e.status === 403)) return false;
    if (useCache) return true;
    return false;
  }
}

function setCredentials(request) {
  var key = request && typeof request.key === 'string' ? request.key.trim() : '';
  if (!BwApi.looksLikeKey(key) || !bwKeyAccepted_(key, false)) {
    return { errorCode: 'INVALID_CREDENTIALS' };
  }
  PropertiesService.getUserProperties().setProperty(BW_KEY_PROPERTY, key);
  return { errorCode: 'NONE' };
}

function isAuthValid() {
  var key = bwStoredKey_();
  if (!key || !BwApi.looksLikeKey(key)) return false;
  return bwKeyAccepted_(key, true);
}

function resetAuth() {
  PropertiesService.getUserProperties().deleteProperty(BW_KEY_PROPERTY);
}

function isAdminUser() {
  return false;
}

// ---------------------------------------------------------------------------
// Errors people can act on
// ---------------------------------------------------------------------------

var BW_DEMO_HINT = 'The public demo key ' + BroadcastwellRoutes.DEMO_KEY + ' reads the fictional Kalvenor sample, account sample.';

function bwUserMessage_(e) {
  if (e && typeof e.bwMessage === 'string') return e.bwMessage;
  if (!(e instanceof BwApi.HttpError)) {
    return 'The Broadcastwell connector hit an unexpected problem. Refresh the data source, and if it happens again write to hello@broadcastwell.com with the time it happened.';
  }
  var detail = e.detail ? ' Broadcastwell says: ' + e.detail : '';
  switch (e.status) {
    case 0:
      return 'Looker Studio could not reach the Broadcastwell API. Try again in a minute.' + detail;
    case 400:
      return 'Broadcastwell did not accept a setting of this data source. Edit the connection and check the account and run.' + detail;
    case 401:
      return 'Broadcastwell did not accept the API key. Revoke access to this connector, then add it again with a key from app.broadcastwell.com/account. ' + BW_DEMO_HINT;
    case 403:
      return 'This API key cannot read that account. Leave Account as me to read your own account. ' + BW_DEMO_HINT;
    case 404:
      return 'No account or run with that id is available to this key. Leave Account as me for your own account, and pick a run from the list or choose Latest run. ' + BW_DEMO_HINT + detail;
    case 409:
      return 'Broadcastwell cannot return this data yet, usually because the run is still being measured. Try again once the run is delivered, or choose Latest run.' + detail;
    case 429:
      var wait = e.retryAfter ? ' Wait ' + e.retryAfter + ' seconds, then refresh the report.' : ' Wait a minute, then refresh the report.';
      return 'Too many requests to the Broadcastwell API.' + wait + ' The demo key allows 30 requests a minute; your own key allows more.';
    default:
      if (e.status >= 500) return 'The Broadcastwell API did not answer this time. Try again in a minute.' + detail;
      return 'The Broadcastwell API answered with status ' + e.status + '.' + detail;
  }
}

function bwThrow_(e) {
  cc.newUserError()
    .setDebugText(String(e && e.message ? e.message : e))
    .setText(bwUserMessage_(e))
    .throwException();
}

function bwRequireKey_() {
  var key = bwStoredKey_();
  if (!key) {
    cc.newUserError()
      .setDebugText('No API key stored')
      .setText('Add your Broadcastwell API key to use this connector. ' + BW_DEMO_HINT)
      .throwException();
  }
  return key;
}

// ---------------------------------------------------------------------------
// Config: stepped. Step 1 asks for the account and the data set. Step 2 asks what
// that data set needs: a history scope, or a run picked from the account's runs.
// ---------------------------------------------------------------------------

var BW_LATEST = 'latest';

function bwRunOptions_(key, account) {
  var list = BwApi.getAll(key, 'listRuns', { account: account }).items;
  return list.map(function (r) {
    var scheduled = (r.passes || []).filter(function (p) { return p.scheduled === true; }).length;
    var when = r.completed_at ? String(r.completed_at).slice(0, 10) : 'not completed';
    return {
      label: r.run_id + ' (' + r.kind + ', ' + scheduled + (scheduled === 1 ? ' scheduled pass, ' : ' scheduled passes, ') + when + ')',
      value: r.run_id,
    };
  });
}

function getConfig(request) {
  var params = (request && request.configParams) || {};
  var config = cc.getConfig();

  config
    .newInfo()
    .setId('intro')
    .setText('Broadcastwell measures whether ChatGPT, Claude, Perplexity, Google AI Overviews and Google AI Mode name your company when buyers ask shortlist questions. Figures come from scheduled passes; adaptive answers are kept apart. Every rate arrives as five columns: percentage, 95% low, 95% high, interval and base, next to its counts.');

  config
    .newTextInput()
    .setId('account')
    .setName('Account')
    .setHelpText('Leave blank or enter me to read your own account. With the public demo key, me reads the fictional Kalvenor sample (account sample).')
    .setPlaceholder('me')
    .setIsDynamic(true);

  var dataset = config
    .newSelectSingle()
    .setId('dataset')
    .setName('Data set')
    .setHelpText('History and Alerts cover every scheduled run. Run summary, Named instead and Sources read one run.')
    .setIsDynamic(true);
  dataset.addOption(config.newOptionBuilder().setLabel('History: one point per scheduled run').setValue('history'));
  dataset.addOption(config.newOptionBuilder().setLabel('Run summary: overall, per engine, per question type').setValue('summary'));
  dataset.addOption(config.newOptionBuilder().setLabel('Named instead: competitors per question').setValue('displacement'));
  dataset.addOption(config.newOptionBuilder().setLabel('Sources: pages cited in scheduled answers').setValue('sources'));
  dataset.addOption(config.newOptionBuilder().setLabel('Alerts: movements where intervals separate').setValue('alerts'));

  var chosen = BwSchema.dataset(params.dataset);
  if (!chosen) {
    config.setIsSteppedConfig(true);
    return config.build();
  }

  if (params.dataset === 'history') {
    var scope = config
      .newSelectSingle()
      .setId('history_scope')
      .setName('History scope')
      .setHelpText('One series for the account, one per engine, or one per question type. Blank means account.')
      .setAllowOverride(true);
    scope.addOption(config.newOptionBuilder().setLabel('Account: all questions and engines').setValue('account'));
    scope.addOption(config.newOptionBuilder().setLabel('Engine: ChatGPT, Claude, Perplexity, Google AI Overviews, Google AI Mode').setValue('engine'));
    scope.addOption(config.newOptionBuilder().setLabel('Question type').setValue('question_type'));
  }

  if (chosen.runLevel) {
    var key = bwRequireKey_();
    var options;
    try {
      options = bwRunOptions_(key, BwApi.accountFor(key, params.account));
    } catch (e) {
      bwThrow_(e);
    }
    var run = config
      .newSelectSingle()
      .setId('run_id')
      .setName('Run')
      .setHelpText('Latest run follows the newest delivered run with scheduled passes, so the report moves on when a new run lands. Blank means Latest run.')
      .setAllowOverride(true);
    run.addOption(config.newOptionBuilder().setLabel('Latest run').setValue(BW_LATEST));
    options.forEach(function (o) {
      run.addOption(config.newOptionBuilder().setLabel(o.label).setValue(o.value));
    });
  }

  if (params.dataset === 'summary') {
    config
      .newCheckbox()
      .setId('include_adaptive')
      .setName('Add the adaptive block as its own row')
      .setHelpText('Adaptive answers re-ask pairs whose scheduled verdicts disagreed. They are never added into the scheduled figures; ticked, they appear as one extra row with pass group Adaptive (shown separately).');
  }

  config.setIsSteppedConfig(false);
  return config.build();
}

// ---------------------------------------------------------------------------
// Schema and data
// ---------------------------------------------------------------------------

function bwDatasetOrThrow_(params) {
  var id = params && params.dataset;
  if (!BwSchema.dataset(id)) {
    cc.newUserError()
      .setDebugText('Unknown data set: ' + id)
      .setText('Choose a data set in the connection settings: History, Run summary, Named instead, Sources or Alerts.')
      .throwException();
  }
  return id;
}

function getSchema(request) {
  var params = (request && request.configParams) || {};
  var id = bwDatasetOrThrow_(params);
  return { schema: BwSchema.buildFields(cc, id).build() };
}

function bwResolveRun_(key, account, runId) {
  var wanted = String(runId || '').trim();
  if (wanted && wanted !== BW_LATEST) return wanted;
  var runs = BwApi.getAll(key, 'listRuns', { account: account }).items;
  var latest = BwMap.latestRunId(runs);
  if (!latest) {
    var err = new Error('No delivered run with scheduled passes');
    err.bwMessage = 'This account has no delivered run with scheduled passes yet, so there is nothing to show for Latest run.';
    throw err;
  }
  return latest;
}

// Fetches and maps the rows for one data set. Returns an array of row objects.
function bwRows_(key, params) {
  var dataset = params.dataset;
  var account = BwApi.accountFor(key, params.account);
  if (dataset === 'history') {
    var scope = params.history_scope || 'account';
    return BwMap.history(BwApi.getJson(key, 'getHistory', { account: account, scope: scope }));
  }
  if (dataset === 'alerts') {
    return BwMap.alerts(BwApi.getAll(key, 'listAlerts', { account: account }).items);
  }
  var run = bwResolveRun_(key, account, params.run_id);
  if (dataset === 'summary') {
    var include = params.include_adaptive === true || params.include_adaptive === 'true';
    return BwMap.summary(BwApi.getJson(key, 'getRunSummary', { account: account, run: run }), include);
  }
  if (dataset === 'displacement') {
    return BwMap.displacement(BwApi.getAll(key, 'listDisplacement', { account: account, run: run }).items, run);
  }
  return BwMap.sources(BwApi.getAll(key, 'listSources', { account: account, run: run }).items, run);
}

function getData(request) {
  var params = (request && request.configParams) || {};
  var id = bwDatasetOrThrow_(params);
  var key = bwRequireKey_();
  var requestedIds = (request.fields || []).map(function (f) { return f.name; });
  var requested = BwSchema.buildFields(cc, id).forIds(requestedIds);
  var ids = requested.asArray().map(function (f) { return f.getId(); });
  var rows;
  try {
    rows = bwRows_(key, params);
  } catch (e) {
    bwThrow_(e);
  }
  return {
    schema: requested.build(),
    rows: BwMap.toValues(rows, ids, BwSchema.fieldTypes(id)),
  };
}
