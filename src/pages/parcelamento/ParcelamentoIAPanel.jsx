import React, { useState } from "react";
import useIaParcelamentoApi from "./iaParcelamentoApi";

export default function ParcelamentoIAPanel({
    planoId,
    alFeature,
    extraParams = {},
    onPreviewIa,
    onSetParamsFromIa,
}) {
    const { sugerirParametros, previewIa, svgPreviewIa } = useIaParcelamentoApi();

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

    const [preferencias, setPreferencias] = useState(
        "Quero lotes de 10x25 sempre que possível, ruas de 12 m e uma praça pequena circular."
    );
    const [iaObs, setIaObs] = useState("");
    const [iaElementos, setIaElementos] = useState([]);
    const [loadingSugestao, setLoadingSugestao] = useState(false);
    const [loadingPreviewIa, setLoadingPreviewIa] = useState(false);
    const [loadingSvg, setLoadingSvg] = useState(false);

    const [svgPreview, setSvgPreview] = useState(null);

    const handleSugerir = async () => {
        if (!planoId) {
            alert("Selecione um projeto (plano) antes de usar a IA.");
            return;
        }
        if (!alFeature?.geometry) {
            alert("Área Loteável/AOI não encontrada.");
            return;
        }
        setLoadingSugestao(true);
        try {
            const payload = {
                al_geom: alFeature.geometry,
                params_iniciais: { ...params, ...(extraParams || {}) },
                restricoes_resumo: {
                    has_ruas_mask_fc: !!extraParams?.has_ruas_mask_fc,
                    has_ruas_eixo_fc: !!extraParams?.has_ruas_eixo_fc,
                },
                preferencias_usuario: preferencias,
            };
            const data = await sugerirParametros(planoId, payload);
            setParams((p) => ({ ...p, ...data.params_sugeridos }));
            setIaObs(data.observacoes || "");
            setIaElementos(data.elementos_especiais || []);
            onSetParamsFromIa?.(data.params_sugeridos);
        } catch (e) {
            console.error("[IA sugerir parâmetros] erro:", e);
            alert("Erro ao pedir sugestão da IA. Veja o console.");
        } finally {
            setLoadingSugestao(false);
        }
    };

    const handlePreviewIa = async () => {
        if (!planoId) {
            alert("Selecione um projeto (plano) antes de usar a IA.");
            return;
        }
        if (!alFeature?.geometry) {
            alert("Área Loteável/AOI não encontrada.");
            return;
        }
        setLoadingPreviewIa(true);
        try {
            const payload = {
                al_geom: alFeature.geometry,
                params_iniciais: { ...params, ...(extraParams || {}) },
                restricoes_resumo: {
                    has_ruas_mask_fc: !!extraParams?.has_ruas_mask_fc,
                    has_ruas_eixo_fc: !!extraParams?.has_ruas_eixo_fc,
                },
                preferencias_usuario: preferencias,
                modo: "full",
            };
            const data = await previewIa(planoId, payload);
            setParams((p) => ({ ...p, ...data.params_usados }));
            setIaObs(data.ia_metadata?.observacoes || "");
            setIaElementos(data.ia_metadata?.elementos_especiais || []);
            onPreviewIa?.(data);
        } catch (e) {
            console.error("[IA preview] erro:", e);
            alert("Erro na pré-visualização IA. Veja o console.");
        } finally {
            setLoadingPreviewIa(false);
        }
    };

    const handleSvgPreview = async () => {
        if (!planoId) {
            alert("Selecione um projeto (plano) antes de usar a IA.");
            return;
        }
        if (!alFeature?.geometry) {
            alert("Área Loteável/AOI não encontrada.");
            return;
        }
        setLoadingSvg(true);
        try {
            const payload = {
                al_geom: alFeature.geometry,
                params_iniciais: { ...params, ...(extraParams || {}) },
                restricoes_resumo: {
                    has_ruas_mask_fc: !!extraParams?.has_ruas_mask_fc,
                    has_ruas_eixo_fc: !!extraParams?.has_ruas_eixo_fc,
                },
                preferencias_usuario: preferencias,
                modo: "full",
            };
            const data = await svgPreviewIa(planoId, payload);
            setSvgPreview(data.svg || null);
        } catch (e) {
            console.error("[IA svg-preview] erro:", e);
            alert("Erro ao gerar SVG IA. Veja o console.");
        } finally {
            setLoadingSvg(false);
        }
    };

    const labelSug = loadingSugestao ? "⏳ Pedindo sugestão..." : "✨ Sugerir parâmetros IA";
    const labelPrevIa = loadingPreviewIa ? "⏳ Pré-visualizando IA..." : "✨ Pré-visualizar com IA";
    const labelSvg = loadingSvg ? "⏳ Gerando ..." : "(IA)";

    return (
        <div className="p-3 mb-10 space-y-3">
            <div>
                <label className="block text-sm font-medium mb-1">
                    Pedido para a IA (preferências)
                </label>
                <textarea
                    className="w-full border rounded p-2 text-sm"
                    rows={3}
                    value={preferencias}
                    onChange={(e) => setPreferencias(e.target.value)}
                />
            </div>

            {/* Parâmetros (editáveis, mas agora influenciados pela IA)
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                <label>
                    Frente mínima (m)
                    <input
                        type="number"
                        className="input"
                        value={params.frente_min_m}
                        onChange={(e) => setParams(p => ({ ...p, frente_min_m: parseFloat(e.target.value) }))}
                    />
                </label>
                <label>
                    Profundidade mínima (m)
                    <input
                        type="number"
                        className="input"
                        value={params.prof_min_m}
                        onChange={(e) => setParams(p => ({ ...p, prof_min_m: parseFloat(e.target.value) }))}
                    />
                </label>
                <label>
                    Larg. rua vertical (m)
                    <input
                        type="number"
                        className="input"
                        value={params.larg_rua_vert_m}
                        onChange={(e) => setParams(p => ({ ...p, larg_rua_vert_m: parseFloat(e.target.value) }))}
                    />
                </label>
                <label>
                    Larg. rua horizontal (m)
                    <input
                        type="number"
                        className="input"
                        value={params.larg_rua_horiz_m}
                        onChange={(e) => setParams(p => ({ ...p, larg_rua_horiz_m: parseFloat(e.target.value) }))}
                    />
                </label>
                <label>
                    Comp. máx quarteirão (m)
                    <input
                        type="number"
                        className="input"
                        value={params.compr_max_quarteirao_m}
                        onChange={(e) => setParams(p => ({ ...p, compr_max_quarteirao_m: parseFloat(e.target.value) }))}
                    />
                </label>
                <label>
                    Orientação (°) (opcional)
                    <input
                        type="number"
                        className="input"
                        value={params.orientacao_graus ?? ""}
                        onChange={(e) => setParams(p => ({
                            ...p,
                            orientacao_graus: e.target.value === "" ? null : parseFloat(e.target.value),
                        }))}
                    />
                </label>
                <label className="md:col-span-3">
                    Largura da calçada (m)
                    <input
                        type="number"
                        className="input"
                        step="0.1"
                        min="0"
                        value={params.calcada_largura_m}
                        onChange={(e) => setParams(p => ({ ...p, calcada_largura_m: parseFloat(e.target.value) }))}
                    />
                </label>
            </div> */}

            <div className="flex flex-wrap gap-2">
                <button
                    className="btn"
                    disabled={loadingSugestao}
                    onClick={handleSugerir}
                >
                    {labelSug}
                </button>
                <br />
                <button
                    className="btn"
                    disabled={loadingPreviewIa}
                    onClick={handlePreviewIa}
                >
                    {labelPrevIa}
                </button>
                <button
                    className="btn"
                    disabled={loadingSvg}
                    onClick={handleSvgPreview}
                >
                    {labelSvg}
                </button>
            </div>

            {iaObs && (
                <div className="text-xs bg-slate-50 border rounded p-2">
                    <div className="font-semibold mb-1">Observações da IA:</div>
                    <div>{iaObs}</div>
                    {iaElementos?.length > 0 && (
                        <div className="mt-1">
                            <div className="font-semibold">Elementos especiais:</div>
                            <pre className="text-[10px] whitespace-pre-wrap">
                                {JSON.stringify(iaElementos, null, 2)}
                            </pre>
                        </div>
                    )}
                </div>
            )}

            {/* {svgPreview && (
                <div className="mt-2">
                    <div className="text-xs font-semibold mb-1">Prévia SVG (IA):</div>
                    <div
                        className="border rounded bg-white overflow-auto max-h-64"
                        dangerouslySetInnerHTML={{ __html: svgPreview }}
                    />
                </div>
            )} */}
        </div>
    );
}
