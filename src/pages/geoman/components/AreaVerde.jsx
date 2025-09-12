// src/pages/geoman/components/AreaVerde.jsx
import React from "react";

/**
 * Painel flutuante para gerenciar Áreas Verdes e Cortes.
 *
 * Props:
 * - open: bool
 * - onClose: fn()
 * - onDrawAreaVerde: fn()
 * - onDrawCorte: fn()
 * - onLimparCortes: fn()
 * - percentPermitido: number
 * - setPercentPermitido: fn(number)
 * - avAreaM2: number
 * - cortesAreaM2: number
 * - cortePct: number
 * - areasCount: number
 * - cortesCount: number
 * - excedeu: bool
 */
export default function AreaVerde({
    open,
    onClose,
    onDrawAreaVerde,
    onDrawCorte,
    onLimparCortes,
    percentPermitido,
    setPercentPermitido,
    avAreaM2,
    cortesAreaM2,
    cortePct,
    areasCount,
    cortesCount,
    excedeu,
}) {
    if (!open) return null;

    return (
        <div className="absolute z-[1100] top-2 left-1/2 -translate-x-1/2">
            <div className="bg-white/20 backdrop-blur rounded-xl shadow-lg border p-3 w-[min(98vw,1080px)]">
                {/* Cabeçalho */}
                <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-lg">Área Verde</h3>
                    <button
                        onClick={onClose}
                        className="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
                        title="Fechar painel"
                    >
                        ✕
                    </button>
                </div>

                {/* Ações principais */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-3">
                    <button
                        onClick={onDrawAreaVerde}
                        className="px-3 py-2 rounded bg-green-600 text-white"
                        title="Desenhar uma nova Área Verde (modo contínuo)"
                    >
                        Criar Área Verde
                    </button>

                    <button
                        onClick={onDrawCorte}
                        className="px-3 py-2 rounded bg-rose-600 text-white"
                        title="Desenhar um novo polígono de Corte (modo contínuo)"
                    >
                        Criar Corte
                    </button>

                    <button
                        onClick={onLimparCortes}
                        className="px-3 py-2 rounded bg-gray-200"
                        title="Remove todos os cortes atuais"
                    >
                        Limpar Corte
                    </button>
                </div>

                {/* Configuração + métricas */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                    {/* Permitido (%) */}
                    <div className="flex items-center gap-2 justify-start bg-gray-50 border rounded p-2">
                        <span className="text-sm">Permitido (%)</span>
                        <input
                            type="number"
                            className="border p-1 rounded w-24"
                            value={Number.isFinite(percentPermitido) ? percentPermitido : 0}
                            onChange={(e) => {
                                const v = parseFloat(e.target.value || "0");
                                setPercentPermitido?.(Number.isFinite(v) ? v : 0);
                            }}
                        />
                    </div>

                    {/* Área Verde total */}
                    <div className="text-sm bg-gray-50 border rounded p-2">
                        <div className="text-gray-600">Área Verde Total (m²)</div>
                        <div className="text-lg font-semibold">
                            {(avAreaM2 || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                        </div>
                    </div>

                    {/* Soma dos cortes */}
                    <div className="text-sm bg-gray-50 border rounded p-2">
                        <div className="text-gray-600">Soma dos Cortes (m²)</div>
                        <div className="text-lg font-semibold">
                            {(cortesAreaM2 || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                        </div>
                    </div>

                    {/* Contagem e percentual */}
                    <div
                        className={`text-sm border rounded p-2 ${excedeu ? "bg-red-50 border-red-300" : "bg-green-50 border-green-300"
                            }`}
                    >
                        <div className="text-gray-600"># AVs / # Cortes</div>
                        <div className="text-base font-medium">
                            {areasCount || 0} / {cortesCount || 0}
                        </div>
                        <div className={`text-lg font-semibold ${excedeu ? "text-red-700" : "text-green-700"}`}>
                            {(cortePct || 0).toFixed(2)}%
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
