// src/pages/parcelamento/ParcelamentoPanel.jsx
import React, { useEffect, useState } from "react";
import useParcelamentoApi from "./parcelamento";

/**
 * Mantém o botão "Pré-visualizar" igual ao seu fluxo
 * + Editor local controlado (ângulo, frente, profundidade, âncora)
 * (sem recurso de Escalar)
 */
export default function ParcelamentoPanel({
    map = null,
    planoId,
    alFeature,
    onPreview,
    onMaterialize,
    extraParams = {},
    selState,
    onApplyFrenteProf,
    onRotate,
    onDelete,
    editTarget,
    onSetMode,
}) {
    const { previewParcelamento, materializarParcelamento, exportVersaoKML } = useParcelamentoApi();

    const [params, setParams] = useState({
        frente_min_m: 10,
        prof_min_m: 25,
        larg_rua_vert_m: 12,
        larg_rua_horiz_m: 12,
        compr_max_quarteirao_m: 200,
        orientacao_graus: null,
        srid_calc: 3857,
        calcada_largura_m: 2.5,
    });

    const [metrics, setMetrics] = useState(null);
    const [versaoId, setVersaoId] = useState(null);
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [isMaterializing, setIsMaterializing] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    // --- estado local para inputs do editor (controlados) ---
    const [editor, setEditor] = useState({
        angle: "",
        frente: "",
        prof: "",
    });


    // sincroniza quando a seleção muda no pai
    useEffect(() => {
        setEditor({
            angle: selState?.angle ?? "",
            frente: selState?.frente ?? "",
            prof: selState?.prof ?? "",
        });
    }, [selState?.count, selState?.kind, selState?.angle, selState?.frente, selState?.prof]);

    // ===== AÇÕES =====
    const loadPreview = async () => {
        if (!planoId) { alert("Selecione um projeto para criar/obter um Plano de Parcelamento."); return; }
        if (!alFeature?.geometry) { alert("Área Loteável/AOI não encontrada."); return; }

        const mergedParams = { ...params, ...(extraParams || {}) };

        setIsPreviewing(true);
        try {
            const data = await previewParcelamento(planoId, {
                alGeom: alFeature.geometry,
                params: mergedParams,
            });
            setMetrics(data?.metrics || null);
            onPreview?.(data);
        } catch (e) {
            console.error("[preview parcelamento] erro:", e?.response?.data || e?.message || e);
            alert("Erro no preview do parcelamento. Veja o console.");
        } finally {
            setIsPreviewing(false);
        }
    };

    const handleMaterializar = async () => {
        if (!planoId) { alert("Plano de Parcelamento não definido."); return; }
        if (!alFeature?.geometry) { alert("Área Loteável/AOI não encontrada."); return; }

        const mergedParams = { ...params, ...(extraParams || {}) };

        setIsMaterializing(true);
        try {
            const res = await materializarParcelamento(planoId, {
                alGeom: alFeature.geometry,
                params: mergedParams,
                userEdits: {},
                isOficial: true,
                nota: "",
            });

            const vId = res?.versao_id;
            if (!vId) { alert("Materialização não retornou versao_id."); return; }

            setVersaoId(vId);
            onMaterialize?.(vId);
        } catch (e) {
            console.error("[materializar parcelamento] erro:", e?.response?.data || e?.message || e);
            alert("Erro ao materializar. Veja o console.");
        } finally {
            setIsMaterializing(false);
        }
    };

    const handleExportKML = async () => {
        if (!versaoId) { alert("Materialize primeiro para gerar KML."); return; }
        setIsExporting(true);
        try {
            const res = await exportVersaoKML(versaoId);
            alert(`KML gerado em: ${res.kml_path}`);
        } catch (e) {
            console.error("[export KML] erro:", e?.response?.data || e?.message || e);
            alert("Erro ao exportar KML. Veja o console.");
        } finally {
            setIsExporting(false);
        }
    };

    const labelPreview = isPreviewing ? "⏳ Pré-visualizando..." : "Pré-visualizar";
    const labelMaterial = isMaterializing ? "⏳ Materializando..." : "Materializar";
    const labelExport = isExporting ? "⏳ Exportando KML..." : "Exportar KML";

    // ====== UI ======
    return (
        <div className="p-3 space-y-3">
            {/* Parâmetros de geração */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <label>Frente mínima (m)
                    <input
                        type="number"
                        className="input"
                        value={params.frente_min_m}
                        onChange={(e) => setParams(p => ({ ...p, frente_min_m: parseFloat(e.target.value) }))}
                    />
                </label>
                <label>Profundidade mínima (m)
                    <input
                        type="number"
                        className="input"
                        value={params.prof_min_m}
                        onChange={(e) => setParams(p => ({ ...p, prof_min_m: parseFloat(e.target.value) }))}
                    />
                </label>
                <label>Larg. rua vertical (m)
                    <input
                        type="number"
                        className="input"
                        value={params.larg_rua_vert_m}
                        onChange={(e) => setParams(p => ({ ...p, larg_rua_vert_m: parseFloat(e.target.value) }))}
                    />
                </label>
                <label>Larg. rua horizontal (m)
                    <input
                        type="number"
                        className="input"
                        value={params.larg_rua_horiz_m}
                        onChange={(e) => setParams(p => ({ ...p, larg_rua_horiz_m: parseFloat(e.target.value) }))}
                    />
                </label>
                <label>Comp. máx quarteirão (m)
                    <input
                        type="number"
                        className="input"
                        value={params.compr_max_quarteirao_m}
                        onChange={(e) => setParams(p => ({ ...p, compr_max_quarteirao_m: parseFloat(e.target.value) }))}
                    />
                </label>
                <label>Orientação (°) (opcional)
                    <input
                        type="number"
                        className="input"
                        value={params.orientacao_graus ?? ""}
                        onChange={(e) => setParams(p => ({ ...p, orientacao_graus: (e.target.value === "" ? null : parseFloat(e.target.value)) }))}
                    />
                </label>

                <label className="md:col-span-3">Largura da calçada (m)
                    <input
                        type="number"
                        className="input"
                        step="0.1"
                        min="0"
                        value={params.calcada_largura_m}
                        onChange={(e) => setParams(p => ({ ...p, calcada_largura_m: parseFloat(e.target.value) }))}
                    />
                </label>
            </div>

            {/* Ações principais */}
            <div className="flex gap-2">
                <button className="btn" onClick={loadPreview}
                    disabled={isPreviewing || isMaterializing || !planoId}
                    title={!planoId ? "Selecione um projeto para obter o plano" : ""}>
                    {labelPreview}
                </button>

                <button className="btn" onClick={handleMaterializar}
                    disabled={isMaterializing || isPreviewing || !planoId}
                    title={!planoId ? "Selecione um projeto para obter o plano" : ""}>
                    {labelMaterial}
                </button>

                <button className="btn" onClick={handleExportKML}
                    disabled={isExporting || !versaoId}
                    title={!versaoId ? "Materialize primeiro" : ""}>
                    {labelExport}
                </button>
            </div>

            {/* Editor da Seleção */}
            <div className="mt-2 border-t pt-2">
                <div className="text-xs text-gray-700 mb-2">
                    Seleção: <b>{selState?.count || 0}</b>
                    {!!selState?.kind && <> • Tipo: <b>{selState.kind}</b></>}
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <label className="col-span-2">
                        Ângulo (°)
                        <input
                            type="number"
                            className="input"
                            step="0.1"
                            value={editor.angle}
                            onChange={(e) => setEditor(ed => ({ ...ed, angle: e.target.value === "" ? "" : Number(e.target.value) }))}
                        />
                    </label>

                    {(selState?.kind === "lote" || selState?.kind === "quarteirao") && (
                        <>
                            <label>
                                Frente (m)
                                <input
                                    type="number"
                                    className="input"
                                    step="0.1"
                                    value={editor.prof}
                                    onChange={(e) => setEditor(ed => ({ ...ed, prof: e.target.value === "" ? "" : Number(e.target.value) }))}
                                />
                            </label>
                            <label>
                                Profundidade (m)
                                <input
                                    type="number"
                                    className="input"
                                    step="0.1"
                                    value={editor.frente}
                                    onChange={(e) => setEditor(ed => ({ ...ed, frente: e.target.value === "" ? "" : Number(e.target.value) }))}
                                />
                            </label>
                        </>
                    )}
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                    <button
                        className="border px-3 py-1 rounded bg-white hover:bg-slate-100"
                        disabled={!(selState?.count === 1)}
                        onClick={() => onRotate?.(Number(editor.angle) || 0)}
                        title="Rotacionar item selecionado"
                    >
                        Rotacionar
                    </button>

                    <button
                        className="border px-3 py-1 rounded bg-white hover:bg-slate-100"
                        disabled={
                            !(
                                selState?.count === 1 &&
                                (selState?.kind === "lote" || selState?.kind === "quarteirao") &&
                                editor.frente !== "" &&
                                editor.prof !== "" &&
                                Number(editor.frente) > 0 &&
                                Number(editor.prof) > 0
                            )
                        }
                        onClick={() =>
                            onApplyFrenteProf?.(
                                Number(editor.angle) || 0,
                                Number(editor.frente),
                                Number(editor.prof)
                            )
                        }

                        title="Aplicar frente/profundidade (mantém ângulo e ancora frente/fundo)"
                    >
                        Aplicar Frente/Prof
                    </button>

                    <button
                        className="border px-3 py-1 rounded bg-white hover:bg-red-50"
                        disabled={!selState?.count}
                        onClick={() => onDelete?.()}
                        title="Deletar seleção"
                    >
                        Deletar
                    </button>

                    <button
                        className={`border px-3 py-1 rounded hover:bg-slate-100 ${editTarget === "lotes" ? "bg-slate-800 text-white" : "bg-white"
                            }`}
                        onClick={() => onSetMode?.(editTarget === "lotes" ? "none" : "lotes")}
                        title="Ativar/Desativar modo Desenhar Lotes"
                    >
                        🟨 Desenhar Lotes
                    </button>

                    <button
                        className={`border px-3 py-1 rounded hover:bg-slate-100 ${editTarget === "quarteiroes" ? "bg-slate-800 text-white" : "bg-white"
                            }`}
                        onClick={() => onSetMode?.(editTarget === "quarteiroes" ? "none" : "quarteiroes")}
                        title="Ativar/Desativar modo Desenhar Quarteirões"
                    >
                        🟦 Desenhar Quarteirões
                    </button>

                </div>
            </div>

            {metrics && (
                <div className="text-sm opacity-80">
                    <div><b>Vias:</b> {metrics.n_vias}</div>
                    <div><b>Quarteirões:</b> {metrics.n_quarteiroes}</div>
                    <div><b>Lotes:</b> {metrics.n_lotes}</div>
                </div>
            )}
        </div>
    );
}
