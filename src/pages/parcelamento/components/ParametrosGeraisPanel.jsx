// src/pages/parcelamento/components/ParametrosGeraisPanel.jsx
import React from "react";

export default function ParametrosGeraisPanel({ value, onChange }) {
    const v = value || {};

    const set = (patch) => onChange?.({ ...v, ...patch });

    return (
        <div className="bg-white/90 backdrop-blur rounded-xl shadow p-3 w-[360px]">
            <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">Parâmetros gerais</h3>
                <div className="text-[11px] text-slate-600">Lotes/calçada</div>
            </div>

            <div className="grid grid-cols-2 gap-2">
                <label className="text-xs">
                    Frente mín (m)
                    <input
                        className="mt-1 w-full border rounded p-2 text-sm"
                        type="number"
                        step="0.1"
                        value={v.frente_min_m ?? 10}
                        onChange={(e) => set({ frente_min_m: Number(e.target.value) })}
                    />
                </label>

                <label className="text-xs">
                    Fundo/Prof mín (m)
                    <input
                        className="mt-1 w-full border rounded p-2 text-sm"
                        type="number"
                        step="0.1"
                        value={v.prof_min_m ?? 25}
                        onChange={(e) => set({ prof_min_m: Number(e.target.value) })}
                    />
                </label>

                <label className="text-xs">
                    Área alvo lote (m²)
                    <input
                        className="mt-1 w-full border rounded p-2 text-sm"
                        type="number"
                        step="1"
                        value={v.area_lote_m2 ?? 250}
                        onChange={(e) => set({ area_lote_m2: Number(e.target.value) })}
                    />
                </label>

                <label className="text-xs">
                    Calçada (m)
                    <input
                        className="mt-1 w-full border rounded p-2 text-sm"
                        type="number"
                        step="0.1"
                        value={v.calcada_largura_m ?? 2.5}
                        onChange={(e) => set({ calcada_largura_m: Number(e.target.value) })}
                    />
                </label>
            </div>

            <div className="mt-2 text-[11px] text-slate-600 leading-4">
                Esses parâmetros não alteram “tipo/largura de vias”. Eles são “globais” e
                serão usados depois (lotes/áreas públicas) e já agora para espaçamentos.
            </div>
        </div>
    );
}
