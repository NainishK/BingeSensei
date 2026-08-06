'use client';

import React, { useState } from 'react';
import styles from './ImportExportModal.module.css';
import api from '@/lib/api';
import { X, Upload, Download, FileText, Film, Tv, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

interface ImportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

// Platform Brand Logos (Official High-Res Favicon Images)
const ImdbLogo = () => (
  <img
    src="https://www.google.com/s2/favicons?domain=imdb.com&sz=128"
    alt="IMDb Logo"
    width={36}
    height={36}
    style={{ borderRadius: '8px', objectFit: 'cover' }}
  />
);

const LetterboxdLogo = () => (
  <img
    src="https://www.google.com/s2/favicons?domain=letterboxd.com&sz=128"
    alt="Letterboxd Logo"
    width={36}
    height={36}
    style={{ borderRadius: '8px', objectFit: 'cover' }}
  />
);

const MALLogo = () => (
  <img
    src="https://www.google.com/s2/favicons?domain=myanimelist.net&sz=128"
    alt="MyAnimeList Logo"
    width={36}
    height={36}
    style={{ borderRadius: '8px', objectFit: 'cover' }}
  />
);

const formatStatusText = (st?: string) => {
  if (!st) return '';
  const clean = st.replaceAll('_', ' ');
  if (clean.toLowerCase() === 'plan to watch') return 'Plan to Watch';
  return clean.charAt(0).toUpperCase() + clean.slice(1);
};

const AniListLogo = () => (
  <img
    src="https://www.google.com/s2/favicons?domain=anilist.co&sz=128"
    alt="AniList Logo"
    width={36}
    height={36}
    style={{ borderRadius: '8px', objectFit: 'cover' }}
  />
);

export default function ImportExportModal({ isOpen, onClose, onSuccess }: ImportExportModalProps) {
  const [activeTab, setActiveTab] = useState<'import' | 'export'>('import');
  const [selectedSource, setSelectedSource] = useState<'imdb' | 'letterboxd' | 'mal' | 'anilist' | 'file'>('imdb');
  const [anilistUsername, setAnilistUsername] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [resolvedItems, setResolvedItems] = useState<any[]>([]);
  const [step, setStep] = useState<'select' | 'preview' | 'done'>('select');
  const [importSummary, setImportSummary] = useState<{ imported: number; skipped: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSourceSelect = (source: 'imdb' | 'letterboxd' | 'mal' | 'anilist' | 'file') => {
    setSelectedSource(source);
    setFile(null);
    setErrorMsg(null);
    setResolvedItems([]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setErrorMsg(null);
    }
  };

  const handleParse = async () => {
    setIsLoading(true);
    setErrorMsg(null);

    try {
      if (selectedSource === 'anilist') {
        if (!anilistUsername.trim()) {
          setErrorMsg('Please enter your AniList username');
          setIsLoading(false);
          return;
        }

        const formData = new FormData();
        formData.append('username', anilistUsername.trim());

        const res = await api.post('/watchlist/import/anilist', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        setResolvedItems(res.data.resolved_items || []);
        setStep('preview');
      } else {
        if (!file) {
          setErrorMsg('Please select a file to import');
          setIsLoading(false);
          return;
        }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('source_type', selectedSource);

        const res = await api.post('/watchlist/import/parse', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        if (!res.data.resolved_items || res.data.resolved_items.length === 0) {
          setErrorMsg('No matching items found in the file');
          setIsLoading(false);
          return;
        }

        setResolvedItems(res.data.resolved_items || []);
        setStep('preview');
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || err.message || 'An error occurred during import');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    setIsLoading(true);
    setErrorMsg(null);

    const chunkSize = 50;
    let totalImported = 0;
    let totalSkipped = 0;

    try {
      for (let i = 0; i < resolvedItems.length; i += chunkSize) {
        const chunk = resolvedItems.slice(i, i + chunkSize);
        const res = await api.post('/watchlist/import/confirm', chunk);

        totalImported += res.data.imported || 0;
        totalSkipped += res.data.skipped || 0;
      }

      setImportSummary({ imported: totalImported, skipped: totalSkipped });
      setStep('done');
      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || err.message || 'Failed to complete import');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async (format: 'json' | 'csv') => {
    try {
      const res = await api.get(`/watchlist/export?format=${format}`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `bingesensei_watchlist.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  const guides = {
    imdb: (
      <div>
        <div className={styles.guideHeader}>💡 How to get your IMDb Watchlist file:</div>
        Go to <b>IMDb.com</b> → Click your profile → <b>Your Watchlist</b> → Click <b>"Actions"</b> (three dots button at top right) → Select <b>"Export"</b> (downloads a <code>.csv</code> file).
      </div>
    ),
    letterboxd: (
      <div>
        <div className={styles.guideHeader}>💡 How to get your Letterboxd Data:</div>
        <p style={{ margin: 0, lineHeight: 1.5 }}>
          Go to <b>Letterboxd.com</b> → <b>Settings</b> → <b>DATA</b> tab → Click <b>"EXPORT YOUR DATA"</b> (upload the raw <code>letterboxd-*.zip</code> archive, or individual <code>watchlist.csv</code> / <code>ratings.csv</code> files).
        </p>
        <p style={{ marginTop: '0.6rem', marginBottom: 0, fontSize: '0.82rem', lineHeight: 1.55, opacity: 0.9 }}>
          🔒 <strong>Privacy Note:</strong> BingeSensei only processes <code>watchlist.csv</code>, <code>watched.csv</code>, and <code>ratings.csv</code>. All personal files (profile, comments, reviews) are completely ignored.
        </p>
      </div>
    ),
    mal: (
      <div>
        <div className={styles.guideHeader}>💡 How to export MyAnimeList file:</div>
        Go to <b>MyAnimeList.net</b> → <b>Anime List</b> → Click the 📄 <b>"Export"</b> icon on the left sidebar menu → Click <b>"Export My List"</b> (downloads <code>animelist_*.xml.gz</code> archive).
      </div>
    ),
    anilist: (
      <div>
        <div className={styles.guideHeader}>⚡ Instant Public Sync:</div>
        No file required! Simply enter your public <b>AniList username</b> below and we'll fetch your anime list directly.
      </div>
    ),
    file: (
      <div>
        <div className={styles.guideHeader}>📄 Native BingeSensei Backup:</div>
        Upload a previously exported <code>bingesensei_watchlist.csv</code> or <code>.json</code> file to restore items.
      </div>
    ),
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <div className={styles.iconBadge}>
              {activeTab === 'import' ? <Upload size={22} /> : <Download size={22} />}
            </div>
            <div>
              <h3 className={styles.title}>Import & Export Watchlist</h3>
              <p className={styles.subtitle}>Sync your watchlists across platforms or keep backups</p>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === 'import' ? styles.tabActive : ''}`}
            onClick={() => {
              setActiveTab('import');
              setStep('select');
            }}
          >
            Import Watchlist
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'export' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('export')}
          >
            Export Backup
          </button>
        </div>

        <div className={styles.content}>
          {errorMsg && (
            <div className={styles.guideBox} style={{ borderColor: 'rgba(239, 68, 68, 0.4)', background: 'rgba(239, 68, 68, 0.08)', color: '#fca5a5' }}>
              <div className={styles.guideHeader} style={{ color: '#f87171' }}>
                <AlertCircle size={16} /> Import Alert
              </div>
              {errorMsg}
            </div>
          )}

          {isLoading && step === 'select' && (
            <div className={styles.guideBox} style={{ borderColor: 'rgba(99, 102, 241, 0.4)', background: 'rgba(99, 102, 241, 0.08)', color: '#c7d2fe', marginBottom: '1.25rem' }}>
              <div className={styles.guideHeader} style={{ color: '#818cf8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Loader2 size={16} className={styles.spinner} /> Fetching & Matching TMDB Metadata...
              </div>
              <div>
                Processing title listings and matching posters in parallel. Large watchlists (500+ items) take a few seconds to complete. Please keep this modal open.
              </div>
            </div>
          )}

          {activeTab === 'import' && (
            <>
              {step === 'select' && (
                <>
                  <div className={styles.sourceGrid}>
                    <button
                      className={`${styles.sourceCard} ${selectedSource === 'imdb' ? styles.sourceCardActive : ''}`}
                      onClick={() => handleSourceSelect('imdb')}
                    >
                      <div className={styles.sourceIcon}><ImdbLogo /></div>
                      <div>
                        <div className={styles.sourceName}>IMDb</div>
                        <div className={styles.sourceFormat}>.csv file</div>
                      </div>
                    </button>

                    <button
                      className={`${styles.sourceCard} ${selectedSource === 'letterboxd' ? styles.sourceCardActive : ''}`}
                      onClick={() => handleSourceSelect('letterboxd')}
                    >
                      <div className={styles.sourceIcon}><LetterboxdLogo /></div>
                      <div>
                        <div className={styles.sourceName}>Letterboxd</div>
                        <div className={styles.sourceFormat}>.zip or .csv</div>
                      </div>
                    </button>

                    <button
                      className={`${styles.sourceCard} ${selectedSource === 'mal' ? styles.sourceCardActive : ''}`}
                      onClick={() => handleSourceSelect('mal')}
                    >
                      <div className={styles.sourceIcon}><MALLogo /></div>
                      <div>
                        <div className={styles.sourceName}>MyAnimeList</div>
                        <div className={styles.sourceFormat}>.xml.gz or .xml</div>
                      </div>
                    </button>

                    <button
                      className={`${styles.sourceCard} ${selectedSource === 'anilist' ? styles.sourceCardActive : ''}`}
                      onClick={() => handleSourceSelect('anilist')}
                    >
                      <div className={styles.sourceIcon}><AniListLogo /></div>
                      <div>
                        <div className={styles.sourceName}>AniList</div>
                        <div className={styles.sourceFormat}>Public Username</div>
                      </div>
                    </button>
                  </div>

                  <div className={styles.guideBox}>{guides[selectedSource]}</div>

                  {selectedSource === 'anilist' ? (
                    <div className={styles.inputGroup}>
                      <label className={styles.label}>AniList Username</label>
                      <input
                        type="text"
                        className={styles.input}
                        placeholder="Enter username (e.g. otaku_sensei)..."
                        value={anilistUsername}
                        onChange={(e) => setAnilistUsername(e.target.value)}
                      />
                    </div>
                  ) : (
                    <label className={`${styles.dropzone} ${file ? styles.dropzoneActive : ''}`}>
                      <input type="file" accept=".csv,.xml,.xml.gz,.gz,.zip,.json" onChange={handleFileChange} hidden />
                      <Upload className={styles.dropzoneIcon} size={32} />
                      <div className={styles.dropzoneText}>
                        {file ? file.name : 'Click to select or drag & drop export file'}
                      </div>
                      <div className={styles.dropzoneSubtext}>Supports .csv, .zip, .xml, .xml.gz, or .json files</div>
                    </label>
                  )}
                </>
              )}

              {step === 'preview' && (
                <div>
                  <div className={styles.previewHeader}>
                    <div className={styles.previewTitle}>Preview Matched Items ({resolvedItems.length})</div>
                  </div>

                  <div className={styles.previewList}>
                    {resolvedItems.map((item, idx) => (
                      <div key={idx} className={styles.previewItem}>
                        {item.poster_path ? (
                          <img
                            src={`https://image.tmdb.org/t/p/w92${item.poster_path}`}
                            alt={item.title}
                            className={styles.previewPoster}
                          />
                        ) : (
                          <div className={styles.previewPoster} />
                        )}
                        <div className={styles.previewMeta}>
                          <div className={styles.previewItemTitle}>{item.title}</div>
                          <div className={styles.previewItemBadge}>
                            {item.media_type?.toUpperCase() === 'TV' ? 'TV Show' : 'Movie'} • {formatStatusText(item.status)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {step === 'done' && (
                <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                  <CheckCircle2 size={56} color="#34d399" style={{ marginBottom: '1rem' }} />
                  <h4 style={{ fontSize: '1.2rem', color: '#f8fafc', marginBottom: '0.5rem' }}>Import Complete!</h4>
                  <p style={{ color: '#94a3b8', fontSize: '0.95rem' }}>
                    Successfully imported <b>{importSummary?.imported}</b> items to your watchlist. ({importSummary?.skipped} already existed).
                  </p>
                </div>
              )}
            </>
          )}

          {activeTab === 'export' && (
            <div className={styles.exportOptions}>
              <div className={styles.exportCard}>
                <div className={styles.exportInfo}>
                  <FileText size={28} color="#a855f7" />
                  <div>
                    <div style={{ fontWeight: 600, color: '#f8fafc' }}>JSON Format</div>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Complete backup with episode progress & notes</div>
                  </div>
                </div>
                <button className={styles.exportBtn} onClick={() => handleExport('json')}>
                  <Download size={16} /> Export JSON
                </button>
              </div>

              <div className={styles.exportCard}>
                <div className={styles.exportInfo}>
                  <FileText size={28} color="#6366f1" />
                  <div>
                    <div style={{ fontWeight: 600, color: '#f8fafc' }}>CSV Format</div>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Spreadsheet compatible (Excel / Google Sheets)</div>
                  </div>
                </div>
                <button className={styles.exportBtn} onClick={() => handleExport('csv')}>
                  <Download size={16} /> Export CSV
                </button>
              </div>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          {activeTab === 'import' && step === 'select' && (
            <button className={styles.submitBtn} onClick={handleParse} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 size={16} className={styles.spinner} /> Processing File...
                </>
              ) : (
                'Continue →'
              )}
            </button>
          )}

          {activeTab === 'import' && step === 'preview' && (
            <>
              <button className={styles.cancelBtn} onClick={() => setStep('select')} disabled={isLoading}>
                Back
              </button>
              <button className={styles.submitBtn} onClick={handleConfirmImport} disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 size={16} className={styles.spinner} /> Adding to Watchlist...
                  </>
                ) : (
                  'Confirm & Add to Watchlist'
                )}
              </button>
            </>
          )}

          {activeTab === 'import' && step === 'done' && (
            <button className={styles.submitBtn} onClick={onClose}>
              Done
            </button>
          )}

          {activeTab === 'export' && (
            <button className={styles.cancelBtn} onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
