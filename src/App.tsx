import { useState, useRef } from 'react';
import { UploadCloud, FileAudio, Loader2, CheckCircle, XCircle, Tag, AlertCircle, Plus, Trash2, Link, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

interface Checklist {
  saludoInicial: boolean;
  identificacionCliente: boolean;
  presentacionCompania: boolean;
  mencionaNotificacion: boolean;
  explicaPrograma: boolean;
  manejoObjecion: boolean;
}

interface AuditReport {
  scriptFollowed: boolean;
  checklist: Checklist;
  shortSummary: string;
  categoryCorrect: boolean;
  actualCategory: string;
}

interface AuditItem {
  id: string;
  type: 'file' | 'url';
  file?: File;
  url?: string;
  expectedCategory: string;
  sourceName?: string;
}

interface AuditResult {
  success: boolean;
  item: AuditItem;
  report?: AuditReport;
  error?: string;
}

function extractPhoneNumber(source: string) {
  if (!source) return "N/A";
  const match = source.match(/-(\d+)\.[a-zA-Z0-9]+$/);
  if (match) return match[1];
  
  const digitsMatch = source.match(/(\d+)[^\d]*$/);
  if (digitsMatch) return digitsMatch[1];
  
  return "N/A";
}

export default function App() {
  const [items, setItems] = useState<AuditItem[]>([
    { id: Math.random().toString(), type: 'file', expectedCategory: '' }
  ]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<AuditResult[] | null>(null);
  const [generalSummary, setGeneralSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agentName, setAgentName] = useState("");

  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  const addItem = () => {
    if (items.length >= 10) return;
    setItems([...items, { id: Math.random().toString(), type: 'file', expectedCategory: '' }]);
  };

  const removeItem = (id: string) => {
    if (items.length <= 1) return;
    setItems(items.filter(item => item.id !== id));
  };

  const updateItem = (id: string, updates: Partial<AuditItem>) => {
    setItems(items.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate
    for (const item of items) {
      if (item.type === 'file' && !item.file) {
        setError('Por favor sube un archivo para todos los items de tipo archivo.');
        return;
      }
      if (item.type === 'url' && !item.url) {
        setError('Por favor ingresa una URL para todos los items de tipo URL.');
        return;
      }
      if (!item.expectedCategory) {
        setError('Por favor ingresa la tipificación esperada para todos los items.');
        return;
      }
    }

    setLoading(true);
    setError(null);
    setResults(null);
    setGeneralSummary(null);

    const formData = new FormData();
    const requestItems: any[] = [];
    let fileIndex = 0;

    items.forEach(item => {
      if (item.type === 'file' && item.file) {
        formData.append('audios', item.file);
        requestItems.push({ type: 'file', fileIndex: fileIndex++, expectedCategory: item.expectedCategory });
      } else if (item.type === 'url') {
        requestItems.push({ type: 'url', url: item.url, expectedCategory: item.expectedCategory });
      }
    });

    formData.append('items', JSON.stringify(requestItems));

    try {
      const response = await fetch('/api/audit-batch', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const text = await response.text();
        let errorMessage = 'Error en la solicitud.';
        try {
          const errorData = JSON.parse(text);
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          errorMessage = `Error del servidor: ${text.slice(0, 100)}`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setResults(data.results);
      setGeneralSummary(data.generalSummary);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = () => {
    if (!results) return;

    const check = (val: boolean) => val ? '✅ Sí' : '❌ No';

    const data = results.map((result) => {
      const source = result.item.sourceName || (result.item.type === 'file' ? `Archivo ${result.item.fileIndex}` : result.item.url) || "N/A";
      const phone = extractPhoneNumber(source);
      const report = result.report;

      if (!report) {
         return {
           "Agente": agentName,
           "Número de Teléfono": phone,
           "URL / Archivo": source,
           "Tipificación del Operador": result.item.expectedCategory,
           "Tipificación Correcta": "N/A",
           "Saludo Inicial": "N/A",
           "Identificación del Cliente": "N/A",
           "Presentación de la Compañía": "N/A",
           "Menciona Notificación Previa": "N/A",
           "Explica el Programa y Beneficios": "N/A",
           "Manejo de Objeción 'Ya recibí el beneficio'": "N/A",
           "Resumen de la Llamada": result.error || "Error al procesar"
         };
      }

      return {
        "Agente": agentName,
        "Número de Teléfono": phone,
        "URL / Archivo": source,
        "Tipificación del Operador": result.item.expectedCategory,
        "Tipificación Correcta": report.actualCategory,
        "Saludo Inicial": check(report.checklist.saludoInicial),
        "Identificación del Cliente": check(report.checklist.identificacionCliente),
        "Presentación de la Compañía": check(report.checklist.presentacionCompania),
        "Menciona Notificación Previa": check(report.checklist.mencionaNotificacion),
        "Explica el Programa y Beneficios": check(report.checklist.explicaPrograma),
        "Manejo de Objeción 'Ya recibí el beneficio'": check(report.checklist.manejoObjecion),
        "Resumen de la Llamada": report.shortSummary
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Auditoría");
    
    if (generalSummary) {
       const wsSummary = XLSX.utils.aoa_to_sheet([
         ["Resumen General de Desempeño"],
         [generalSummary]
       ]);
       wsSummary["!cols"] = [{ wch: 100 }];
       XLSX.utils.book_append_sheet(wb, wsSummary, "Resumen General");
    }

    XLSX.writeFile(wb, `Auditoria_${agentName || 'Llamadas'}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <FileAudio className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-gray-900">Auditoría Masiva de Llamadas</h1>
              <p className="text-sm text-gray-500 font-medium">Análisis automático de múltiples audios</p>
            </div>
          </div>
          <div className="text-sm text-gray-500">
            Los guiones y tipificaciones se cargan desde el servidor <br/> <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">/config/*.txt</code>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Panel de Configuración */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-200 bg-gray-50/50 flex justify-between items-center">
                <h2 className="text-lg font-semibold text-gray-900">Audios a Procesar</h2>
                <span className="text-xs font-semibold bg-gray-200 text-gray-700 px-2 py-1 rounded-full">{items.length}/10</span>
              </div>
              
              <form onSubmit={handleSubmit} className="p-6 space-y-6">
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del Agente / Operador</label>
                    <input
                      type="text"
                      value={agentName}
                      onChange={(e) => setAgentName(e.target.value)}
                      placeholder="Ej. Juan Pérez"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="border-t border-gray-200 pt-4">
                    <h3 className="text-sm font-medium text-gray-700 mb-3">Llamadas a Auditar</h3>
                  </div>

                  {items.map((item, index) => (
                    <div key={item.id} className="p-4 border border-gray-200 rounded-xl bg-gray-50 relative">
                      {items.length > 1 && (
                        <button 
                          type="button" 
                          onClick={() => removeItem(item.id)}
                          className="absolute -top-2 -right-2 bg-white border border-gray-200 text-red-500 rounded-full p-1 shadow-sm hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      
                      <div className="flex items-center gap-4 mb-4">
                        <span className="text-sm font-semibold text-gray-500">Llamada {index + 1}</span>
                        <div className="flex bg-gray-200 p-1 rounded-lg">
                          <button
                            type="button"
                            onClick={() => updateItem(item.id, { type: 'file' })}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${item.type === 'file' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                          >
                            Archivo
                          </button>
                          <button
                            type="button"
                            onClick={() => updateItem(item.id, { type: 'url' })}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${item.type === 'url' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                          >
                            URL
                          </button>
                        </div>
                      </div>

                      {item.type === 'file' ? (
                        <div className="mb-4">
                          <input
                            type="file"
                            accept="audio/*"
                            ref={el => fileInputRefs.current[item.id] = el}
                            className="hidden"
                            onChange={(e) => {
                              if (e.target.files && e.target.files.length > 0) {
                                updateItem(item.id, { file: e.target.files[0] });
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => fileInputRefs.current[item.id]?.click()}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
                          >
                            <UploadCloud className="w-4 h-4" />
                            {item.file ? item.file.name : 'Seleccionar Audio'}
                          </button>
                        </div>
                      ) : (
                        <div className="mb-4">
                          <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden bg-white">
                            <div className="pl-3 pr-2 text-gray-400">
                              <Link className="w-4 h-4" />
                            </div>
                            <input
                              type="url"
                              value={item.url || ''}
                              onChange={(e) => updateItem(item.id, { url: e.target.value })}
                              placeholder="https://ejemplo.com/audio.mp3"
                              className="w-full py-2 pr-3 text-sm focus:outline-none"
                            />
                          </div>
                        </div>
                      )}

                      <div>
                        <div className="flex items-center gap-2 border border-gray-300 rounded-lg overflow-hidden bg-white">
                          <div className="pl-3 pr-2 text-gray-400">
                            <Tag className="w-4 h-4" />
                          </div>
                          <input
                            type="text"
                            value={item.expectedCategory}
                            onChange={(e) => updateItem(item.id, { expectedCategory: e.target.value })}
                            className="w-full py-2 pr-3 text-sm focus:outline-none"
                            placeholder="Tipificación del operador (ej. Interesado)"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3">
                  {items.length < 10 && (
                    <button
                      type="button"
                      onClick={addItem}
                      className="flex-1 border border-dashed border-gray-300 text-gray-600 hover:border-gray-400 hover:text-gray-800 font-medium py-2 px-4 rounded-lg flex items-center justify-center gap-2 text-sm transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Añadir Llamada
                    </button>
                  )}
                </div>

                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <p>{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Analizando {items.length} audios...
                    </>
                  ) : (
                    `Ejecutar Auditoría Masiva (${items.length})`
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* Panel de Resultados */}
          <div className="lg:col-span-7 space-y-6">
            {loading ? (
              <div className="h-full min-h-[500px] flex flex-col items-center justify-center text-gray-400 bg-white border border-gray-200 rounded-xl border-dashed">
                <Loader2 className="w-8 h-8 animate-spin mb-4 text-blue-500" />
                <p className="text-sm font-medium text-gray-500">Evaluando llamadas...</p>
                <p className="text-xs mt-2 text-gray-400 max-w-[250px] text-center">Esto tomará unos segundos para procesar todos los audios por lote.</p>
              </div>
            ) : results ? (
              <div className="space-y-6">
                
                <div className="flex justify-between items-center mb-2">
                   <h2 className="text-xl font-bold text-gray-900">Resultados de Auditoría</h2>
                   <button 
                     onClick={handleExportExcel}
                     className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                   >
                     <Download className="w-4 h-4" />
                     Exportar a Excel
                   </button>
                </div>

                {generalSummary && (
                  <div className="bg-indigo-50 border border-indigo-100 p-5 rounded-xl animate-in fade-in slide-in-from-bottom-2">
                    <h3 className="text-indigo-800 font-bold text-sm mb-2 flex items-center gap-2">
                      Resumen General del Operador
                    </h3>
                    <p className="text-indigo-900/80 text-sm whitespace-pre-wrap leading-relaxed">
                      {generalSummary}
                    </p>
                  </div>
                )}

                {results.map((result, idx) => (
                  <div key={idx} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: `${idx * 100}ms` }}>
                    <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="bg-gray-200 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-gray-600 shrink-0">
                          {idx + 1}
                        </div>
                        <h2 className="text-sm font-semibold text-gray-900 truncate max-w-[250px]">
                          {result.item.type === 'file' ? `Archivo ${result.item.fileIndex + 1}` : result.item.url}
                        </h2>
                      </div>
                      
                      {result.success && result.report && (
                        <div className="flex items-center gap-2">
                           <div className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${result.report.scriptFollowed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {result.report.scriptFollowed ? 'Guión OK' : 'Falla Guión'}
                          </div>
                          <div className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${result.report.categoryCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {result.report.categoryCorrect ? 'Tip. OK' : 'Falla Tip.'}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="p-6">
                      {!result.success ? (
                        <div className="flex items-start gap-2 text-red-600 bg-red-50 p-4 rounded-lg">
                          <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
                          <p className="text-sm font-medium">{result.error}</p>
                        </div>
                      ) : result.report ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          
                          {/* Checklist Section */}
                          <div className="space-y-3">
                            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Checklist Guión</h3>
                            <ul className="space-y-2">
                              {[
                                { key: 'saludoInicial', label: 'Saludo inicial' },
                                { key: 'identificacionCliente', label: 'Identificación del cliente' },
                                { key: 'presentacionCompania', label: 'Presentación de la compañía' },
                                { key: 'mencionaNotificacion', label: 'Menciona notificación previa' },
                                { key: 'explicaPrograma', label: 'Explica el programa y sus beneficios' },
                                { key: 'manejoObjecion', label: "Manejo de objeción 'ya recibí el beneficio'" }
                              ].map((checkItem, i) => {
                                const isChecked = result.report!.checklist[checkItem.key as keyof Checklist];
                                return (
                                  <li key={i} className="flex items-start gap-2 text-sm">
                                    {isChecked ? (
                                      <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                                    ) : (
                                      <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                                    )}
                                    <span className={isChecked ? 'text-gray-700' : 'text-gray-500 line-through'}>{checkItem.label}</span>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>

                          <div className="space-y-6">
                            {/* Category Section */}
                            <div>
                               <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Tipificación</h3>
                               <div className="flex flex-col gap-1 text-sm bg-gray-50 p-3 rounded-lg border border-gray-100">
                                 <div className="flex justify-between">
                                    <span className="text-gray-500">Operador:</span>
                                    <span className="font-medium text-gray-900">{result.item.expectedCategory}</span>
                                 </div>
                                 <div className="flex justify-between">
                                    <span className="text-gray-500">Correcta:</span>
                                    <span className={`font-bold ${result.report.categoryCorrect ? 'text-green-600' : 'text-red-600'}`}>{result.report.actualCategory}</span>
                                 </div>
                               </div>
                            </div>

                            {/* Summary Section */}
                            <div>
                              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Resumen</h3>
                              <p className="text-sm text-gray-700 leading-relaxed bg-blue-50/50 p-3 rounded-lg border border-blue-100/50">
                                {result.report.shortSummary}
                              </p>
                            </div>
                          </div>

                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full min-h-[500px] flex flex-col items-center justify-center text-gray-400 bg-gray-50 border border-gray-200 rounded-xl border-dashed">
                <CheckCircle className="w-12 h-12 mb-4 text-gray-300" />
                <p className="text-sm font-medium text-gray-500">Los informes aparecerán aquí</p>
                <p className="text-xs mt-1 text-gray-400 max-w-sm text-center">Puedes procesar hasta 10 llamadas a la vez.</p>
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}