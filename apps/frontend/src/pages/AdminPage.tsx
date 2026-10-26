import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ApiError,
  clearAdminToken,
  createAdminModel,
  deleteAdminModel,
  getAdminSettings,
  getAdminToken,
  getCurrentModel,
  listAdminModels,
  setDefaultModel,
  testAdminModel,
  updateAdminModel,
  updateAdminSettings
} from '../api/client';
import type { AdminModel } from '../api/client';
import { IconClose, IconGauge, IconLogout, IconPlus, IconPencil, IconRefresh, IconServer, IconSettings, IconTrash } from '../components/icons';

type ModelDraft = Partial<AdminModel> & { id: string; api_key: string };

export default function AdminPage() {
  const navigate = useNavigate();
  const [models, setModels] = useState<AdminModel[]>([]);
  const [effectiveModel, setEffectiveModel] = useState<{ model_id: string | null; base_url: string | null; provider: string | null; source: string | null } | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingDefault, setSavingDefault] = useState(false);
  const [defaultModelId, setDefaultModelId] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ModelDraft>>({});
  const [showNewModel, setShowNewModel] = useState(false);
  const [newModel, setNewModel] = useState<{
    label: string;
    model_id: string;
    base_url: string;
    api_key: string;
    is_enabled: boolean;
    is_default: boolean;
    sort_order: number;
  }>({ label: '', model_id: '', base_url: '', api_key: '', is_enabled: true, is_default: false, sort_order: 0 });

  async function load() {
    setLoading(true);
    setError('');
    try {
    const [modelsList, settingsMap, effective] = await Promise.all([listAdminModels(), getAdminSettings(), getCurrentModel()]);
    setModels(modelsList);
    setSettings(settingsMap);
    setEffectiveModel(effective);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Failed to load admin data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (getAdminToken()) void load();
  }, []);

  function draftFor(model: AdminModel): ModelDraft {
    return {
      id: model.id,
      label: model.label,
      model_id: model.model_id,
      base_url: model.base_url ?? '',
      api_key: '',
      is_enabled: model.is_enabled,
      is_default: model.is_default,
      sort_order: model.sort_order
    };
  }

  function startEdit(model: AdminModel) {
    setError('');
    setInfo('');
    setEditingId(model.id);
    setDrafts(prev => ({ ...prev, [model.id]: draftFor(model) }));
  }

  function cancelEdit() {
    setEditingId(null);
    setDrafts({});
  }

  function setField(id: string, key: string, value: string) {
    setDrafts(prev => ({ ...prev, [id]: { ...prev[id], [key]: value } }));
  }

  async function saveModel(id: string) {
    const draft = drafts[id];
    if (!draft) return;
    setLoading(true);
    setError('');
    try {
      const updated = await updateAdminModel(id, {
        label: draft.label,
        model_id: draft.model_id,
        base_url: draft.base_url || null,
        api_key: draft.api_key || null,
        is_enabled: draft.is_enabled,
        is_default: draft.is_default,
        sort_order: Number(draft.sort_order) || 0
      });
      setModels(prev => prev.map(m => (m.id === id ? { ...m, ...updated } : m)));
      setEditingId(null);
      setDrafts({});
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Failed to save model.');
    } finally {
      setLoading(false);
    }
  }

  async function createModel() {
    setLoading(true);
    setError('');
    try {
      await createAdminModel({
        label: newModel.label,
        model_id: newModel.model_id,
        base_url: newModel.base_url || null,
        api_key: newModel.api_key || null,
        is_enabled: newModel.is_enabled,
        is_default: newModel.is_default,
        sort_order: newModel.sort_order
      });
      setShowNewModel(false);
      setNewModel({ label: '', model_id: '', base_url: '', api_key: '', is_enabled: true, is_default: false, sort_order: 0 });
      void load();
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Failed to create model.');
    } finally {
      setLoading(false);
    }
  }

  async function removeModel(id: string) {
    if (!window.confirm('Delete this model? This cannot be undone.')) return;
    setLoading(true);
    setError('');
    try {
      await deleteAdminModel(id);
      setModels(prev => prev.filter(m => m.id !== id));
      if (editingId === id) cancelEdit();
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete model.');
    } finally {
      setLoading(false);
    }
  }

  async function testModel(id: string) {
    const row = models.find(m => m.id === id);
    if (!row) return;
    setLoading(true);
    setError('');
    setInfo('');
    try {
      const result = await testAdminModel(id);
      if (result.ok) {
        setInfo(`“${row.label}” responded OK.`);
      } else {
        setError(`“${row.label}” test failed: ${result.error ?? 'unknown error'}`);
      }
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Model test failed.');
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    setSavingSettings(true);
    setError('');
    setInfo('');
    try {
      await updateAdminSettings(settings);
      setInfo('Settings saved.');
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Failed to save settings.');
    } finally {
      setSavingSettings(false);
    }
  }

  async function setDefault() {
    if (!defaultModelId) return;
    setSavingDefault(true);
    setError('');
    setInfo('');
    try {
      await setDefaultModel(defaultModelId);
      setInfo('Default model updated.');
      setDefaultModelId('');
      void load();
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Failed to set default model.');
    } finally {
      setSavingDefault(false);
    }
  }

  const defaultModel = models.find(m => m.is_default);

  if (!getAdminToken()) {
    return (
      <main className="main-pane admin-page">
        <header className="main-header">
          <div className="main-title">Admin</div>
        </header>
        <div className="documents-box">
          <p className="empty-note">Admin access required. Sign in as an administrator to manage models and settings.</p>
          <button className="btn btn-primary" onClick={() => navigate('/admin/login', { replace: true })}>
            Sign in as admin
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="main-pane admin-page">
      <header className="main-header">
        <div className="main-title">Admin</div>
        <div className="header-spacer" />
        <button className="btn btn-ghost btn-icon" aria-label="Sign out" title="Sign out" onClick={() => { clearAdminToken(); navigate('/login', { replace: true }); }}>
          <IconLogout size={16} />
        </button>
      </header>

      {error && <p className="error-text" role="alert">{error}</p>}
      {info && <p className="success-text" role="status">{info}</p>}

      {/* ---------- Default model ---------- */}
      <section className="documents-box">
        <div className="documents-head">
          <div>
            <h3>Default model</h3>
            <p className="empty-note">The model used for chat answers unless a per-request override is set. Only one model can be the default.</p>
          </div>
        </div>
        <div className="admin-default-card">
          <div className="admin-default-info">
            {effectiveModel?.source === 'database' ? (
              <>
                <span className="admin-default-label">{defaultModel?.label ?? effectiveModel?.model_id ?? 'unknown'}</span>
                <span className="admin-default-model">{effectiveModel?.model_id}</span>
                <span className="admin-chip admin-chip-default">database</span>
                {effectiveModel?.base_url && <span> · {effectiveModel.base_url}</span>}
              </>
            ) : (
              <>
                <span className="admin-default-label">No default model set</span>
                <span className="admin-default-model">{effectiveModel?.model_id ?? 'not configured'}</span>
                <span className="admin-chip">environment</span>
                {effectiveModel?.base_url && <span> · {effectiveModel.base_url}</span>}
              </>
            )}
          </div>
          <div className="admin-default-actions">
            <select
              className="input"
              value={defaultModelId}
              onChange={e => setDefaultModelId(e.target.value)}
              disabled={savingDefault}
            >
              <option value="">Select a model to make default</option>
              {models
                .filter(m => effectiveModel?.source === 'database' ? m.id !== defaultModel?.id : true)
                .map(m => (
                  <option key={m.id} value={m.id}>
                    {m.label} ({m.model_id})
                  </option>
                ))}
            </select>
            <button className="btn btn-primary" onClick={setDefault} disabled={savingDefault || !defaultModelId}>
              {savingDefault ? 'Setting…' : 'Make default'}
            </button>
          </div>
        </div>
      </section>

      {/* ---------- Models ---------- */}
      <section className="documents-box" style={{ marginTop: 'var(--space-5)' }}>
        <div className="documents-head">
          <div>
            <h3>Models</h3>
            <p className="empty-note">Configure the language models available in the chat picker. Changes apply immediately.</p>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={() => setShowNewModel(!showNewModel)} title={showNewModel ? 'Hide add form' : 'Add model'}>
            <IconPlus size={15} />
          </button>
        </div>

        {showNewModel && (
          <div className="admin-model-row admin-add-row">
            <div className="admin-model-info">
              <div className="admin-model-label">Add model</div>
            </div>
            <div className="admin-model-meta">
              <input className="input" placeholder="Label" value={newModel.label} onChange={e => setNewModel({ ...newModel, label: e.target.value })} />
              <input className="input" placeholder="Model ID" value={newModel.model_id} onChange={e => setNewModel({ ...newModel, model_id: e.target.value })} />
              <input className="input" placeholder="Base URL (optional)" value={newModel.base_url} onChange={e => setNewModel({ ...newModel, base_url: e.target.value })} />
              <input className="input" placeholder="API key (optional)" value={newModel.api_key} onChange={e => setNewModel({ ...newModel, api_key: e.target.value })} />
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: '12px', color: 'var(--text-faint)' }}>
                <input type="checkbox" checked={newModel.is_enabled} onChange={e => setNewModel({ ...newModel, is_enabled: e.target.checked })} /> Enabled
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', marginLeft: 'var(--space-2)', fontSize: '12px', color: 'var(--text-faint)' }}>
                <input type="checkbox" checked={newModel.is_default} onChange={e => setNewModel({ ...newModel, is_default: e.target.checked })} /> Default
              </label>
              <input className="input" type="number" placeholder="Sort order" value={String(newModel.sort_order)} onChange={e => setNewModel({ ...newModel, sort_order: Number(e.target.value) || 0 })} />
              <button className="btn btn-primary" onClick={createModel} disabled={loading || !newModel.label || !newModel.model_id}>
                {loading ? 'Creating…' : 'Add model'}
              </button>
            </div>
          </div>
        )}

        <ul className="admin-model-list">
          {models.length === 0 && (
            <li className="admin-model-empty">
              <p className="empty-note">No models configured. Add one below.</p>
            </li>
          )}
          {models.map(model => {
            const editing = editingId === model.id;
            const draft = drafts[model.id];
            const current = model.is_default;
            return (
              <li key={model.id} className={`admin-model-row ${current ? 'admin-model-default' : ''} ${editing ? 'admin-model-editing' : ''}`}>
                <div className="admin-model-head">
                  <span className="admin-model-icon" aria-hidden="true">
                    <IconServer size={18} />
                  </span>
                  <div className="admin-model-info">
                    {editing ? (
                      <div className="admin-edit">
                        <div className="admin-edit-label">
                          <input className="input" autoFocus value={draft!.label} onChange={e => setField(model.id, 'label', e.target.value)} />
                        </div>
                        <div className="admin-edit-fields">
                          <input className="input" placeholder="Model ID" value={draft!.model_id} onChange={e => setField(model.id, 'model_id', e.target.value)} />
                          <input className="input" placeholder="Base URL" value={draft!.base_url ?? ''} onChange={e => setField(model.id, 'base_url', e.target.value)} />
                          <input className="input" placeholder="API key" value={draft!.api_key ?? ''} onChange={e => setField(model.id, 'api_key', e.target.value)} />
                        </div>
                        <div className="admin-edit-toggles">
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: '12px', color: 'var(--text-faint)' }}>
                            <input type="checkbox" checked={draft!.is_enabled} onChange={e => setField(model.id, 'is_enabled', String(e.target.checked))} /> Enabled
                          </label>
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', marginLeft: 'var(--space-2)', fontSize: '12px', color: 'var(--text-faint)' }}>
                            <input type="checkbox" checked={draft!.is_default} onChange={e => setField(model.id, 'is_default', String(e.target.checked))} /> Default
                          </label>
                          <input className="input" type="number" style={{ width: '70px', marginLeft: 'var(--space-2)' }} value={String(draft!.sort_order)} onChange={e => setField(model.id, 'sort_order', e.target.value)} />
                        </div>
                        <div className="admin-edit-actions">
                          <button className="btn btn-ghost btn-icon" onClick={() => saveModel(model.id)} title="Save" disabled={loading}>
                            <IconRefresh size={15} />
                          </button>
                          <button className="btn btn-ghost btn-icon" onClick={cancelEdit} title="Cancel">
                            <IconClose size={16} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="admin-row-title">
                          <span className="admin-row-label">{model.label}</span>
                          {current && <span className="admin-chip admin-chip-default">Default</span>}
                          {model.is_default && <span className="admin-chip admin-chip-default">Default</span>}
                        </div>
                        <div className="admin-row-meta">
                          <span style={{ whiteSpace: 'nowrap' }}>{model.model_id}</span>
                          {model.base_url ? <span> · {model.base_url}</span> : <span style={{ color: 'var(--text-faint)' }}>default base URL</span>}
                        </div>
                        <div className="admin-row-status">
                          <span className={`admin-key-badge ${model.has_api_key ? 'admin-key-set' : 'admin-key-none'}`}>
                            {model.has_api_key ? 'Key: ••••••••' : 'Key: not set'}
                          </span>
                          <span>{model.is_enabled ? 'Enabled' : 'Disabled'}</span>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="admin-model-actions">
                    {editing ? (
                      <>
                        <button className="btn btn-ghost btn-icon" onClick={() => saveModel(model.id)} title="Save" disabled={loading}>
                          <IconRefresh size={15} />
                        </button>
                        <button className="btn btn-ghost btn-icon" onClick={cancelEdit} title="Cancel">
                          <IconClose size={16} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="btn btn-ghost btn-icon" onClick={() => startEdit(model)} title="Edit">
                          <IconPencil size={15} />
                        </button>
                        <button className="btn btn-ghost btn-icon" onClick={() => testModel(model.id)} title="Test model" disabled={loading}>
                          <IconGauge size={15} />
                        </button>
                        {!current && (
                          <button className="btn btn-ghost btn-icon" onClick={() => { setDefaultModelId(model.id); void setDefault(); }} title="Make default" disabled={loading || savingDefault}>
                            ★
                          </button>
                        )}
                        {!current && (
                          <button className="btn btn-danger-ghost btn-icon" onClick={() => removeModel(model.id)} title="Delete model">
                            <IconTrash size={16} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ---------- Settings ---------- */}
      <section className="documents-box" style={{ marginTop: 'var(--space-5)' }}>
        <div className="documents-head">
          <div>
            <h3>Settings</h3>
            <p className="empty-note">Application-wide settings stored in the database. Edit a value and save.</p>
          </div>
        </div>
        <ul className="admin-settings-list">
          {Object.entries(settings).length === 0 && (
            <li className="admin-settings-empty">
              <p className="empty-note">No settings configured.</p>
            </li>
          )}
          {Object.entries(settings).filter(([key]) => key !== 'llm_model' && key !== 'llm_base_url').map(([key, value]) => (
            <li key={key} className="admin-settings-row">
              <div className="admin-settings-key">{key}</div>
              <div className="admin-settings-value">
                <input
                  className="input"
                  value={value}
                  onChange={e => setSettings(prev => ({ ...prev, [key]: e.target.value }))}
                />
              </div>
            </li>
          ))}
        </ul>
        <div className="documents-head">
          <button className="btn btn-primary" onClick={saveSettings} disabled={savingSettings}>
            {savingSettings ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </section>
    </main>
  );
}
