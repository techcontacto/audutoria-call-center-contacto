import { useState, useRef } from 'react';
import { UploadCloud, FileAudio, Loader2, CheckCircle, XCircle, FileText, Tag, AlertCircle, MessageSquareWarning, List } from 'lucide-react';

interface AuditReport {
  scriptFollowed: boolean;
  scriptDeviations: string[];
  objectionsHandled: boolean;
  objectionsFeedback: string;
  categoryCorrect: boolean;
  actualCategory: string;
  feedback: string;
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [script, setScript] = useState('');
  const [objections, setObjections] = useState('');
  const [availableCategories, setAvailableCategories] = useState('');
  const [expectedCategory, setExpectedCategory] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<AuditReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !script || !expectedCategory || !availableCategories) {
      setError('Por favor, completa los campos obligatorios.');
      return;
    }

    setLoading(true);
    setError(null);
    setReport(null);

    const formData = new FormData();
    formData.append('audio', file);
    formData.append('script', script);
    formData.append('objections', objections);
    formData.append('availableCategories', availableCategories);
    formData.append('expectedCategory', expectedCategory);

    try {
      const response = await fetch('/api/audit', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errorMessage = 'Error en la solicitud.';
        try {
          const text = await response.text();
          try {
            const errorData = JSON.parse(text);
            errorMessage = errorData.error || errorMessage;
          } catch (e) {
            console.error("Respuesta no es JSON:", text);
            if (response.status === 413) {
              errorMessage = 'El archivo es demasiado grande.';
            } else if (response.status === 502 || response.status === 504) {
               errorMessage = 'Error de conexión con el servidor (502/504).';
            } else {
               // Include a snippet of the HTML to help debug
               errorMessage = `Error del servidor (${response.status}): ${text.slice(0, 100)}`;
            }
          }
        } catch (e) {
          // Fallback if text() fails
        }
        throw new Error(errorMessage);
      }

      const responseText = await response.text();
      let data: AuditReport;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        console.error("No se pudo parsear como JSON:", responseText.slice(0, 200));
        if (responseText.toLowerCase().includes('<!doctype')) {
          throw new Error("El servidor está reiniciándose o cargando. Por favor, espera unos segundos e intenta de nuevo.");
        }
        throw new Error("Respuesta inválida del servidor. Intenta de nuevo.");
      }

      setReport(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg">
            <FileAudio className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900">Auditoría de Llamadas</h1>
            <p className="text-sm text-gray-500 font-medium">Análisis automático con Inteligencia Artificial</p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Panel de Configuración */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-200 bg-gray-50/50">
                <h2 className="text-lg font-semibold text-gray-900">Configuración de Auditoría</h2>
              </div>
              
              <form onSubmit={handleSubmit} className="p-6 space-y-6">
                {/* File Upload */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Archivo de Audio *</label>
                  <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer transition-colors ${
                      file ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400 bg-gray-50 hover:bg-gray-100'
                    }`}
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      accept="audio/*"
                      onChange={handleFileChange}
                    />
                    {file ? (
                      <div className="flex flex-col items-center text-blue-600">
                        <FileAudio className="w-8 h-8 mb-2" />
                        <span className="text-sm font-medium text-center">{file.name}</span>
                        <span className="text-xs text-blue-400 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center text-gray-500">
                        <UploadCloud className="w-8 h-8 mb-2 text-gray-400" />
                        <span className="text-sm font-medium">Click o arrastra para subir</span>
                        <span className="text-xs text-gray-400 mt-1">MP3, WAV, M4A hasta 20MB</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Script Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-500" />
                    Guión General *
                  </label>
                  <textarea
                    rows={4}
                    value={script}
                    onChange={(e) => setScript(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm resize-none"
                    placeholder="Ej. 'Buenos días... (los puntos clave a tratar)'"
                  />
                  <p className="text-xs text-gray-500 mt-1">El modelo evaluará si se cubrieron los puntos clave, permitiendo flexibilidad.</p>
                </div>

                {/* Objections Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                    <MessageSquareWarning className="w-4 h-4 text-gray-500" />
                    Manejo de Objeciones
                  </label>
                  <textarea
                    rows={3}
                    value={objections}
                    onChange={(e) => setObjections(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm resize-none"
                    placeholder="Ej. Si dice que no tiene tiempo, ofrecer una llamada más tarde..."
                  />
                </div>

                {/* Available Categories Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                    <List className="w-4 h-4 text-gray-500" />
                    Tipificaciones Disponibles *
                  </label>
                  <textarea
                    rows={4}
                    value={availableCategories}
                    onChange={(e) => setAvailableCategories(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm resize-none"
                    placeholder="Ej. - No Interesado: El cliente rechaza la oferta rotundamente.&#10;- Volver a llamar: El cliente pide que lo llamen en otro momento."
                  />
                </div>

                {/* Expected Category Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                    <Tag className="w-4 h-4 text-gray-500" />
                    Tipificación dada por el operador *
                  </label>
                  <input
                    type="text"
                    value={expectedCategory}
                    onChange={(e) => setExpectedCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    placeholder="Ej. 'Soporte Técnico'"
                  />
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
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Analizando...
                    </>
                  ) : (
                    'Ejecutar Auditoría'
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* Panel de Resultados */}
          <div className="lg:col-span-7">
            {loading ? (
              <div className="h-full min-h-[500px] flex flex-col items-center justify-center text-gray-400 bg-white border border-gray-200 rounded-xl border-dashed">
                <Loader2 className="w-8 h-8 animate-spin mb-4 text-blue-500" />
                <p className="text-sm font-medium text-gray-500">Escuchando y analizando audio...</p>
                <p className="text-xs mt-2 text-gray-400 max-w-[250px] text-center">Evaluando guión, objeciones y tipificación.</p>
              </div>
            ) : report ? (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="px-6 py-5 border-b border-gray-200 bg-gray-50/50 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900">Informe de Auditoría</h2>
                  <div className={`px-3 py-1 rounded-full text-xs font-semibold ${report.scriptFollowed && report.categoryCorrect ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                    {report.scriptFollowed && report.categoryCorrect ? 'Cumple' : 'Requiere Atención'}
                  </div>
                </div>

                <div className="p-6 space-y-8">
                  {/* Script Assessment */}
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      {report.scriptFollowed ? (
                        <CheckCircle className="w-6 h-6 text-green-500 mt-0.5 shrink-0" />
                      ) : (
                        <XCircle className="w-6 h-6 text-red-500 mt-0.5 shrink-0" />
                      )}
                      <div>
                        <h3 className="text-base font-semibold text-gray-900">Seguimiento de Guión</h3>
                        <p className="text-sm text-gray-600 mt-1">
                          {report.scriptFollowed 
                            ? 'El operador cubrió los puntos clave del guión.' 
                            : 'El operador omitió partes importantes del guión.'}
                        </p>
                      </div>
                    </div>

                    {!report.scriptFollowed && report.scriptDeviations.length > 0 && (
                      <div className="ml-9 bg-red-50 rounded-lg p-4 border border-red-100">
                        <h4 className="text-sm font-semibold text-red-900 mb-2">Desviaciones importantes:</h4>
                        <ul className="list-disc list-inside text-sm text-red-800 space-y-1">
                          {report.scriptDeviations.map((dev, idx) => (
                            <li key={idx}>{dev}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  <hr className="border-gray-100" />

                  {/* Objections Assessment */}
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      {report.objectionsHandled ? (
                        <CheckCircle className="w-6 h-6 text-green-500 mt-0.5 shrink-0" />
                      ) : (
                        <XCircle className="w-6 h-6 text-amber-500 mt-0.5 shrink-0" />
                      )}
                      <div>
                        <h3 className="text-base font-semibold text-gray-900">Manejo de Objeciones</h3>
                        <p className="text-sm text-gray-600 mt-2">{report.objectionsFeedback}</p>
                      </div>
                    </div>
                  </div>

                  <hr className="border-gray-100" />

                  {/* Category Assessment */}
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      {report.categoryCorrect ? (
                        <CheckCircle className="w-6 h-6 text-green-500 mt-0.5 shrink-0" />
                      ) : (
                        <XCircle className="w-6 h-6 text-amber-500 mt-0.5 shrink-0" />
                      )}
                      <div>
                        <h3 className="text-base font-semibold text-gray-900">Tipificación (Categorización)</h3>
                        <p className="text-sm text-gray-600 mt-1">
                          {report.categoryCorrect 
                            ? 'La llamada fue tipificada correctamente según las opciones disponibles.' 
                            : 'La tipificación seleccionada es incorrecta o no es la más adecuada.'}
                        </p>
                      </div>
                    </div>

                    {!report.categoryCorrect && (
                      <div className="ml-9 bg-amber-50 rounded-lg p-4 border border-amber-100">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <span className="block text-xs font-semibold text-amber-700 uppercase tracking-wider mb-1">Ingresada por operador</span>
                            <span className="text-sm text-gray-800 font-medium">{expectedCategory}</span>
                          </div>
                          <div>
                            <span className="block text-xs font-semibold text-amber-700 uppercase tracking-wider mb-1">Categoría Correcta Sugerida</span>
                            <span className="text-sm text-gray-800 font-medium">{report.actualCategory}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <hr className="border-gray-100" />

                  {/* Overall Feedback */}
                  <div>
                    <h3 className="text-base font-semibold text-gray-900 mb-2">Feedback General</h3>
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{report.feedback}</p>
                    </div>
                  </div>

                </div>
              </div>
            ) : (
              <div className="h-full min-h-[500px] flex flex-col items-center justify-center text-gray-400 bg-gray-50 border border-gray-200 rounded-xl border-dashed">
                <FileText className="w-12 h-12 mb-4 text-gray-300" />
                <p className="text-sm font-medium text-gray-500">El informe aparecerá aquí</p>
                <p className="text-xs mt-1 text-gray-400 max-w-sm text-center">Sube un audio y completa los datos de configuración para comenzar el análisis.</p>
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}

