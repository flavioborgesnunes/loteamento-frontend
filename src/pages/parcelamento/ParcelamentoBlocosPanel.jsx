// src/pages/parcelamento-ia/ParcelamentoBlocosPanel.jsx
import React, { useMemo, useState } from "react";
import useParcelamentoBlocosApi from "./parcelamentoBlocosApi.js";

export default function ParcelamentoBlocosPanel({
    restricoesId,
    versaoId,
    setVersaoId,
    alFeature,
    linhaBase,
    onPreviewBlocos,
}) {
    const { gerarQuarteiroesIncremental } = useParcelamentoBlocosApi();

    const DEFAULTS = useMemo(
        () => ({
            prof_lote_m: 25,
            fileiras: 2,
            calcada_largura_m: 2.5,
            calcada_encosta_aoi: false,
            larg_rua_horiz_m: 12,
            larg_rua_vert_m: 12,
            frente_min_m: 10,
            compr_max_quarteirao_m: 120, // ✅ sempre usado
            preferencia_cardinal: "NW",
            orientacao_modo: "auto_top_edge", // auto_top_edge | usar_orientacao_graus
            orientacao_graus: null,
            srid_calc: 3857,
            girar_90: false,
        }),
        []
    );

    const [params, setParams] = useState({ ...DEFAULTS });

    const [maxQuarteiroes, setMaxQuarteiroes] = useState(1);
    const [loading, setLoading] = useState(false);
    const [lastMetrics, setLastMetrics] = useState(null);

    // ✅ novo: permitir iniciar uma fase nova (trocar linha base/orientação)
    const [startNewPhase, setStartNewPhase] = useState(false);

    function extrairLinhaSuperiorDaAL(alFeature) {
        if (!alFeature?.geometry) return null;
        const geom = alFeature.geometry;

        if (geom.type !== "Polygon" && geom.type !== "MultiPolygon") return null;

        let ring = null;
        if (geom.type === "Polygon") ring = geom.coordinates?.[0] || null;
        if (geom.type === "MultiPolygon") ring = geom.coordinates?.[0]?.[0] || null;

        if (!ring || ring.length < 2) return null;

        let bestP1 = null;
        let bestP2 = null;
        let bestY = -Infinity;

        for (let i = 0; i < ring.length - 1; i++) {
            const p1 = ring[i];
            const p2 = ring[i + 1];
            const ymax = Math.max(p1[1], p2[1]);
            if (ymax > bestY) {
                bestY = ymax;
                bestP1 = p1;
                bestP2 = p2;
            }
        }

        if (!bestP1 || !bestP2) return null;

        return {
            type: "Feature",
            geometry: { type: "LineString", coordinates: [bestP1, bestP2] },
            properties: { origem: "top-edge" },
        };
    }

    const handleChangeNumber = (field) => (e) => {
        const v = e.target.value;
        setParams((p) => ({ ...p, [field]: v === "" ? "" : parseFloat(v) }));
    };

    const handleChangeInt = (field) => (e) => {
        const v = e.target.value;
        setParams((p) => ({ ...p, [field]: v === "" ? "" : parseInt(v, 10) }));
    };

    const handleChangeSelect = (field) => (e) => {
        setParams((p) => ({ ...p, [field]: e.target.value }));
    };

    const handlePreviewIncremental = async () => {
        if (!restricoesId) {
            alert("Selecione uma restrição antes.");
            return;
        }

        // linha base:
        // - criação: obrigatória (se não desenhou, extrai da AL)
        // - continuação: se startNewPhase=true, exige linhaBase (ou extrai AL se não tiver)
        let linhaParaUsar = null;

        const precisaLinha = !versaoId || startNewPhase;

        if (precisaLinha) {
            linhaParaUsar = linhaBase?.geometry ? linhaBase : extrairLinhaSuperiorDaAL(alFeature);
            if (!linhaParaUsar) {
                alert("Você precisa definir uma linha base (ou ter AL para extrair uma).");
                return;
            }
        }

        // validações
        if (!params.prof_lote_m || params.prof_lote_m <= 0) {
            alert("Profundidade do lote (prof_lote_m) deve ser > 0.");
            return;
        }
        if (![1, 2].includes(Number(params.fileiras))) {
            alert("Fileiras deve ser 1 ou 2.");
            return;
        }
        if (params.calcada_largura_m === "" || params.calcada_largura_m < 0) {
            alert("Largura da calçada deve ser >= 0.");
            return;
        }
        if (!params.larg_rua_horiz_m || params.larg_rua_horiz_m <= 0) {
            alert("larg_rua_horiz_m deve ser > 0.");
            return;
        }
        if (!params.larg_rua_vert_m || params.larg_rua_vert_m <= 0) {
            alert("larg_rua_vert_m deve ser > 0.");
            return;
        }
        if (!params.frente_min_m || params.frente_min_m <= 0) {
            alert("frente_min_m deve ser > 0 (por compat do model).");
            return;
        }

        // ✅ compr_max sempre presente e sempre > 0
        const paramsLimpos = { ...params };
        if (!paramsLimpos.compr_max_quarteirao_m || paramsLimpos.compr_max_quarteirao_m <= 0) {
            paramsLimpos.compr_max_quarteirao_m = DEFAULTS.compr_max_quarteirao_m;
        }

        // ✅ sinaliza backend para iniciar nova fase (trocar orientação) se marcado
        paramsLimpos.start_new_phase = !!startNewPhase;

        setLoading(true);
        try {
            const result = await gerarQuarteiroesIncremental({
                restricoesId,
                versaoId,
                linhaBase: precisaLinha ? linhaParaUsar : null,
                params: paramsLimpos,
                maxQuarteiroes,
            });

            if (!versaoId && result?.versao_id) {
                setVersaoId?.(result.versao_id);
            }

            setLastMetrics(result.metrics || null);
            onPreviewBlocos?.(result);
        } catch (error) {
            console.error("[parcelamento-blocos][API] status:", error.response?.status);
            console.error("[parcelamento-blocos][API] data:", error.response?.data);
            alert(JSON.stringify(error.response?.data || { error: error.message }, null, 2));
            throw error;
        } finally {
            setLoading(false);
            // depois de executar uma fase nova, desmarca (pra não trocar sem querer de novo)
            setStartNewPhase(false);
        }
    };

    return (
        <div className="p-3 mb-6 space-y-3 border rounded bg-white/80 text-xs">
            <h3 className="text-sm font-semibold mb-1">Quarteirões + Calçadas (incremental)</h3>

            <label className="flex items-center gap-2 text-[11px] mt-2 select-none">
                <input
                    type="checkbox"
                    checked={!!params.girar_90}
                    onChange={(e) => {
                        const checked = e.target.checked;
                        setParams((p) => ({ ...p, girar_90: checked }));
                        setStartNewPhase(true); // ✅ força recomeçar com a nova orientação
                    }}

                />
                Girar 90° (perpendicular à linha base)
            </label>


            <div className="text-[11px] mb-1">
                Restrição:{" "}
                {restricoesId ? (
                    <span className="text-emerald-700 font-semibold">#{restricoesId}</span>
                ) : (
                    <span className="text-red-600 font-semibold">não selecionada</span>
                )}
                {" • "}
                Versão:{" "}
                {versaoId ? (
                    <span className="text-emerald-700 font-semibold">#{versaoId}</span>
                ) : (
                    <span className="text-amber-700 font-semibold">ainda não criada</span>
                )}
            </div>

            {versaoId && (
                <div className="flex items-center gap-2 text-[11px]">
                    <input
                        id="startNewPhase"
                        type="checkbox"
                        checked={startNewPhase}
                        onChange={(e) => setStartNewPhase(e.target.checked)}
                    />
                    <label htmlFor="startNewPhase" className="select-none">
                        Trocar linha base / iniciar nova fase (nova orientação)
                    </label>
                </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <label className="block">
                    Prof. lote (m)
                    <input type="number" className="input w-full" value={params.prof_lote_m} onChange={handleChangeNumber("prof_lote_m")} min={0} step={0.1} />
                </label>

                <label className="block">
                    Fileiras
                    <select className="input w-full" value={String(params.fileiras)} onChange={(e) => setParams((p) => ({ ...p, fileiras: parseInt(e.target.value, 10) }))}>
                        <option value="1">1 fileira</option>
                        <option value="2">2 fileiras</option>
                    </select>
                </label>

                <label className="block">
                    Max quarteirões (chamada)
                    <input type="number" className="input w-full" value={maxQuarteiroes} onChange={(e) => setMaxQuarteiroes(Number(e.target.value || 1))} min={1} step={1} />
                </label>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <label className="block">
                    Compr. máx quarteirão (m)
                    <input
                        type="number"
                        className="input w-full"
                        value={params.compr_max_quarteirao_m}
                        onChange={handleChangeNumber("compr_max_quarteirao_m")}
                        min={1}
                        step={0.1}
                    />
                </label>

                <label className="block">
                    Rua horiz (m)
                    <input type="number" className="input w-full" value={params.larg_rua_horiz_m} onChange={handleChangeNumber("larg_rua_horiz_m")} min={0} step={0.1} />
                </label>

                <label className="block">
                    Rua vert (m)
                    <input type="number" className="input w-full" value={params.larg_rua_vert_m} onChange={handleChangeNumber("larg_rua_vert_m")} min={0} step={0.1} />
                </label>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <label className="block">
                    Frente mín (m) (compat)
                    <input type="number" className="input w-full" value={params.frente_min_m} onChange={handleChangeNumber("frente_min_m")} min={0} step={0.1} />
                </label>

                <label className="block">
                    SRID calc
                    <input type="number" className="input w-full" value={params.srid_calc} onChange={handleChangeInt("srid_calc")} min={0} step={1} />
                </label>

                <label className="block">
                    Preferência cardinal
                    <select className="input w-full" value={params.preferencia_cardinal} onChange={handleChangeSelect("preferencia_cardinal")}>
                        <option value="NW">NW</option>
                        <option value="NE">NE</option>
                        <option value="SW">SW</option>
                        <option value="SE">SE</option>
                    </select>
                </label>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <label className="block">
                    Calçada (m)
                    <input type="number" className="input w-full" value={params.calcada_largura_m} onChange={handleChangeNumber("calcada_largura_m")} min={0} step={0.1} />
                </label>

                <label className="block">
                    Encosta na AOI?
                    <select
                        className="input w-full"
                        value={params.calcada_encosta_aoi ? "1" : "0"}
                        onChange={(e) => setParams((p) => ({ ...p, calcada_encosta_aoi: e.target.value === "1" }))}
                    >
                        <option value="0">Não</option>
                        <option value="1">Sim</option>
                    </select>
                </label>
            </div>

            <div className="space-y-1">
                <div className="font-semibold text-[11px]">Orientação</div>
                <div className="flex flex-wrap gap-2 items-center">
                    <button
                        type="button"
                        onClick={() => setParams((p) => ({ ...p, orientacao_modo: "auto_top_edge" }))}
                        className={"px-2 py-1 rounded border text-[11px]" + (params.orientacao_modo === "auto_top_edge" ? " bg-blue-600 text-white border-blue-600" : " bg-white text-gray-700")}
                    >
                        Automática (top edge)
                    </button>

                    <button
                        type="button"
                        onClick={() => setParams((p) => ({ ...p, orientacao_modo: "usar_orientacao_graus" }))}
                        className={"px-2 py-1 rounded border text-[11px]" + (params.orientacao_modo === "usar_orientacao_graus" ? " bg-blue-600 text-white border-blue-600" : " bg-white text-gray-700")}
                    >
                        Fixa (graus)
                    </button>

                    {params.orientacao_modo === "usar_orientacao_graus" && (
                        <div className="flex items-center gap-1">
                            <span className="text-[11px]">Ângulo</span>
                            <input
                                type="number"
                                className="input w-20"
                                value={params.orientacao_graus ?? ""}
                                onChange={(e) => setParams((p) => ({ ...p, orientacao_graus: e.target.value === "" ? null : parseFloat(e.target.value) }))}
                            />
                        </div>
                    )}
                </div>

                {versaoId && startNewPhase && (
                    <div className="text-[11px] text-amber-800 mt-1">
                        Nesta chamada, a linha base atual será usada para iniciar uma nova fase (orientação diferente).
                    </div>
                )}
            </div>

            <div className="flex flex-wrap gap-2 mt-2">
                <button
                    type="button"
                    onClick={handlePreviewIncremental}
                    disabled={loading}
                    className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs disabled:opacity-60"
                >
                    {loading ? "Gerando..." : versaoId ? "Gerar próximo(s)" : "Criar versão + gerar"}
                </button>

                {versaoId && (
                    <button type="button" onClick={() => setVersaoId?.(null)} className="px-3 py-2 rounded bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs">
                        Nova versão
                    </button>
                )}
            </div>

            {lastMetrics && (
                <div className="mt-2 text-[11px] bg-slate-50 border rounded p-2">
                    <div className="font-semibold mb-1">Resumo:</div>
                    <div><strong>Quarteirões total:</strong> {lastMetrics.n_quarteiroes_total}</div>
                    <div><strong>Calçadas total:</strong> {lastMetrics.n_calcadas_total}</div>
                    <div><strong>Novos nesta chamada:</strong> {lastMetrics.n_novos}</div>
                    <div><strong>Step index:</strong> {lastMetrics.step_index}</div>
                </div>
            )}
        </div>
    );
}
