// src/pages/parcelamento/components/ViasPanel.jsx
import React, { useEffect, useMemo, useState } from "react";
import useAxios from "../../../utils/useAxios";
import { X, RefreshCcw, CheckCircle2 } from "lucide-react";

/**
 * ViasPanel (refatorado)
 * - Agora NÃO guarda parâmetros gerais de lote/calcada internamente.
 * - Recebe paramsGerais (frente/profundidade/area_lote/calcada) por props.
 * - Mantém aqui apenas parâmetros de vias/quarteirões + avançados.
 *
 * Props (novas):
 *  - paramsGerais: { frente_min_m, prof_min_m|prof_ideal_m, area_lote_m2, calcada_largura_m }
 *  - setParamsGerais: fn
 *
 * Mantidas:
 *  - restricoesId, alFeature, linhaBase, onClose, onLoaded, onPickSuggestion, existingRanked, existingBest
 */
export default function ViasPanel({
    restricoesId,
    alFeature,
    linhaBase,
    onClose,
    onLoaded,
    onPickSuggestion,
    existingRanked = [],
    existingBest = null,

    // ✅ novos
    paramsGerais,
    setParamsGerais,
}) {
    const axiosAuth = useAxios();

    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const [ranked, setRanked] = useState(existingRanked || []);
    const [best, setBest] = useState(existingBest || null);
    const [selectedId, setSelectedId] = useState(existingBest?.id || "");

    // ✅ Agora este form é SOMENTE de vias/quarteirões/avançado
    const [form, setForm] = useState({
        // vias
        larg_rua_horiz_m: 12,
        larg_rua_vert_m: 12,

        // quarteirões (estrutura)
        fileiras: 2,
        compr_max_quarteirao_m: 160,
        tol_block_len: 0.25,

        // tolerâncias de profundidade (ainda úteis p/ heurística)
        // obs: "fundo" vem no paramsGerais (prof_min_m ou prof_ideal_m)
        tol_prof_down: 0.25,
        tol_prof_up: 0.5,

        // ✅ Regras flexíveis por fundos (Y - paralelas)
        y_min_fundos: 1,
        y_max_fundos: 2,
        y_tol_fundos: 0.1,

        // (Opcional) controle extra das travessas (X)
        x_min_mult: "",
        x_max_mult: "",
        x_tol: "",

        // ✅ Política de fileiras (manual)
        rows_policy: "edge_1_interior_prefer_2",
        // fator * prof_ideal/prof_min (vira metros no backend)
        edge_band_factor: 1.5,
        top_band_factor: 1.5,

        // opcional
        orientacao_graus: "",
    });

    useEffect(() => {
        if (best && onPickSuggestion) onPickSuggestion(best);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const alGeojson = useMemo(() => {
        const geom = alFeature?.geometry || null;
        if (!geom) return null;
        return geom;
    }, [alFeature]);

    const canRun = !!alGeojson;
    const setField = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

    const normalizeNumber = (v) => {
        if (v === "" || v == null) return "";
        const n = Number(v);
        return Number.isFinite(n) ? n : "";
    };

    const pickSuggestion = (sug) => {
        if (!sug) return;
        setSelectedId(sug.id);
        setBest((prev) => prev || sug);

        if (onPickSuggestion) onPickSuggestion(sug);

        // ✅ NOVO: aplica no mapa o preview da sugestão
        if (onLoaded) onLoaded(sug.preview || sug);
    };


    // -----------------------
    // ✅ params gerais vindos do painel separado
    // -----------------------
    const gerais = paramsGerais || {};
    const setGerais = (patch) => setParamsGerais?.({ ...gerais, ...patch });

    const run = async () => {
        setErr("");
        if (!canRun) {
            setErr("Área loteável (AL) não encontrada. Selecione uma versão que tenha area_loteavel.");
            return;
        }

        // ✅ Junta tudo: gerais + vias/quarteirões
        // Observação: seu backend atual usa prof_ideal_m; eu aceito tanto prof_min_m quanto prof_ideal_m.
        const params = {
            // ------- gerais -------
            frente_min_m: Number(gerais.frente_min_m ?? 10),
            // fundo/profundidade: compat
            prof_ideal_m: Number(gerais.prof_ideal_m ?? gerais.prof_min_m ?? 30),
            // área lote (não usada agora, mas já vai no contrato)
            area_lote_m2: Number(gerais.area_lote_m2 ?? 250),
            // calçada agora é geral (mas usada nas vias)
            calcada_largura_m: Number(gerais.calcada_largura_m ?? 2.5),

            // ------- vias/quarteirões -------
            fileiras: Number(form.fileiras),
            larg_rua_horiz_m: Number(form.larg_rua_horiz_m),
            larg_rua_vert_m: Number(form.larg_rua_vert_m),

            compr_max_quarteirao_m: Number(form.compr_max_quarteirao_m),
            tol_block_len: Number(form.tol_block_len),

            tol_prof_down: Number(form.tol_prof_down),
            tol_prof_up: Number(form.tol_prof_up),

            y_min_fundos: Number(form.y_min_fundos),
            y_max_fundos: Number(form.y_max_fundos),
            y_tol_fundos: Number(form.y_tol_fundos),

            rows_policy: String(form.rows_policy || "edge_1_interior_prefer_2"),
            edge_band_factor: Number(form.edge_band_factor),
            top_band_factor: Number(form.top_band_factor),
        };

        if (form.x_min_mult !== "" && form.x_min_mult != null) params.x_min_mult = Number(form.x_min_mult);
        if (form.x_max_mult !== "" && form.x_max_mult != null) params.x_max_mult = Number(form.x_max_mult);
        if (form.x_tol !== "" && form.x_tol != null) params.x_tol = Number(form.x_tol);

        if (form.orientacao_graus !== "" && form.orientacao_graus != null) {
            params.orientacao_graus = Number(form.orientacao_graus);
        }

        const body = {
            al_geojson: alGeojson,
            params,
            targets: {
                ratio_vias_min: 0.06,
                ratio_vias_max: 0.22,
                big_area_m2: 250000,
                min_block_area_m2: 200,
            },
            srid_calc: 3857,
            linha_base: linhaBase || null,
            restricoes_id: restricoesId || null,
        };

        setBusy(true);
        try {
            const { data } = await axiosAuth.post("roads/preview/", body);

            console.log("[roads/preview] received:", {
                hasBest: !!data?.best,
                rankedLen: data?.ranked?.length,
                bestKeys: data?.best ? Object.keys(data.best) : null,
            });

            const rk = data?.ranked || [];
            const bs = data?.best || null;

            setRanked(rk);
            setBest(bs);
            setSelectedId(bs?.id || rk?.[0]?.id || "");

            if (bs) pickSuggestion(bs);
            else if (rk.length) pickSuggestion(rk[0]);

            // ✅ NOVO: o que vai pro mapa é o preview do parcelamento (dentro do best/ranked)
            const preview =
                bs?.preview ||
                rk?.[0]?.preview ||
                null;

            // Mantém compatibilidade: se ainda não veio preview, usa o payload antigo
            if (onLoaded) onLoaded(preview || data);

        } catch (e) {
            console.error("[ViasPanel] erro ao gerar vias:", e);
            const msg =
                e?.response?.data?.detail ||
                e?.response?.data?.error ||
                e?.message ||
                "Erro ao gerar vias.";
            setErr(String(msg));
        } finally {
            setBusy(false);
        }

    };

    const fmt = (n, digits = 2) => (Number.isFinite(Number(n)) ? Number(n).toFixed(digits) : "—");

    const currentSelected = useMemo(() => {
        return ranked.find((r) => r.id === selectedId) || best || null;
    }, [ranked, selectedId, best]);

    return (
        <div className="w-[460px] max-h-[80vh] overflow-y-auto bg-white/95 backdrop-blur rounded-xl shadow-xl border border-slate-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                <div>
                    <div className="text-sm font-bold text-slate-900">Malha Viária</div>
                    <div className="text-[11px] text-slate-500">
                        Gera múltiplas sugestões (low/mid/high) e aplica política de fileiras nos quarteirões.
                    </div>
                </div>

                <button type="button" onClick={onClose} className="p-2 rounded hover:bg-slate-100" title="Fechar">
                    <X className="w-4 h-4 text-slate-700" />
                </button>
            </div>

            <div className="px-4 py-3 space-y-3">
                {!canRun && (
                    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                        Selecione uma versão que tenha <strong>area_loteavel</strong> para habilitar o gerador.
                    </div>
                )}

                {err && (
                    <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">{err}</div>
                )}

                {/* ✅ BLOCO: Dados gerais (somente leitura/ajuste rápido, mas ficam no painel separado) */}
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs font-bold text-slate-800 mb-2">Dados gerais (lote/calçada)</div>
                    <div className="grid grid-cols-2 gap-2">
                        <Field
                            label="Frente mín (m)"
                            value={gerais.frente_min_m ?? 10}
                            onChange={(v) => setGerais({ frente_min_m: Number(normalizeNumber(v) || 0) })}
                            disabled={busy}
                        />
                        <Field
                            label="Fundo/Prof (m)"
                            value={gerais.prof_ideal_m ?? gerais.prof_min_m ?? 30}
                            onChange={(v) => setGerais({ prof_ideal_m: Number(normalizeNumber(v) || 0) })}
                            disabled={busy}
                        />
                        <Field
                            label="Área lote (m²)"
                            value={gerais.area_lote_m2 ?? 250}
                            onChange={(v) => setGerais({ area_lote_m2: Number(normalizeNumber(v) || 0) })}
                            disabled={busy}
                        />
                        <Field
                            label="Calçada (m)"
                            value={gerais.calcada_largura_m ?? 2.5}
                            onChange={(v) => setGerais({ calcada_largura_m: Number(normalizeNumber(v) || 0) })}
                            disabled={busy}
                        />
                    </div>
                    <div className="mt-2 text-[11px] text-slate-500">
                        *Esses valores também aparecem no painel separado. Aqui é só um “resumo/atalho”.*
                    </div>
                </div>

                {/* ✅ BLOCO: Parâmetros de vias / quarteirões */}
                <div className="rounded-lg border border-slate-200 p-3">
                    <div className="text-xs font-bold text-slate-800 mb-2">Parâmetros de vias e quarteirões</div>

                    <div className="grid grid-cols-2 gap-2">
                        <Field
                            label="Rua horiz (m)"
                            value={form.larg_rua_horiz_m}
                            onChange={(v) => setField("larg_rua_horiz_m", normalizeNumber(v))}
                            disabled={busy}
                        />
                        <Field
                            label="Rua vert (m)"
                            value={form.larg_rua_vert_m}
                            onChange={(v) => setField("larg_rua_vert_m", normalizeNumber(v))}
                            disabled={busy}
                        />

                        <Field
                            label="Compr. alvo quadra (m)"
                            value={form.compr_max_quarteirao_m}
                            onChange={(v) => setField("compr_max_quarteirao_m", normalizeNumber(v))}
                            disabled={busy}
                        />
                        <Field
                            label="Tol. comp. quadra (0-1)"
                            value={form.tol_block_len}
                            onChange={(v) => setField("tol_block_len", normalizeNumber(v))}
                            disabled={busy}
                        />

                        <Field
                            label="Fileiras (hint)"
                            value={form.fileiras}
                            onChange={(v) => setField("fileiras", normalizeNumber(v))}
                            disabled={busy}
                        />
                        <Field
                            label="Orientação (graus) opcional"
                            value={form.orientacao_graus}
                            onChange={(v) => setField("orientacao_graus", v)}
                            placeholder="ex: 15"
                            disabled={busy}
                        />
                    </div>
                </div>

                {/* ✅ BLOCO: Avançado (mantive igual, só reorganizei) */}
                <div className="rounded-lg border border-slate-200 p-3">
                    <div className="text-xs font-bold text-slate-800 mb-2">Avançado</div>

                    <div className="grid grid-cols-2 gap-2">
                        <Field
                            label="Tol. prof ↓ (0-1)"
                            value={form.tol_prof_down}
                            onChange={(v) => setField("tol_prof_down", normalizeNumber(v))}
                            disabled={busy}
                        />
                        <Field
                            label="Tol. prof ↑ (0-1)"
                            value={form.tol_prof_up}
                            onChange={(v) => setField("tol_prof_up", normalizeNumber(v))}
                            disabled={busy}
                        />

                        {/* Regras flexíveis Y */}
                        <Field
                            label="Y min fundos"
                            value={form.y_min_fundos}
                            onChange={(v) => setField("y_min_fundos", normalizeNumber(v))}
                            disabled={busy}
                        />
                        <Field
                            label="Y max fundos"
                            value={form.y_max_fundos}
                            onChange={(v) => setField("y_max_fundos", normalizeNumber(v))}
                            disabled={busy}
                        />
                        <Field
                            label="Tol fundos (0-1)"
                            value={form.y_tol_fundos}
                            onChange={(v) => setField("y_tol_fundos", normalizeNumber(v))}
                            disabled={busy}
                        />

                        {/* Opcionais X */}
                        <Field label="X min mult (opc)" value={form.x_min_mult} onChange={(v) => setField("x_min_mult", v)} disabled={busy} placeholder="ex: 0.75" />
                        <Field label="X max mult (opc)" value={form.x_max_mult} onChange={(v) => setField("x_max_mult", v)} disabled={busy} placeholder="ex: 1.25" />
                        <Field label="X tol (opc)" value={form.x_tol} onChange={(v) => setField("x_tol", v)} disabled={busy} placeholder="ex: 0.05" />

                        {/* Política de fileiras */}
                        <Select
                            label="Política de fileiras (manual)"
                            value={form.rows_policy}
                            onChange={(v) => setField("rows_policy", v)}
                            disabled={busy}
                            options={[
                                { value: "edge_1_interior_prefer_2", label: "Bordas 1 fileira; miolo prefere 2" },
                                { value: "top_1_interior_prefer_2", label: "Topo 1 fileira; resto prefere 2" },
                                { value: "first_last_1_interior_prefer_2", label: "Primeiro/último 1 fileira; meio prefere 2" },
                                { value: "prefer_2_by_width", label: "Preferir 2 por largura (auto)" },
                            ]}
                        />

                        <Field
                            label="Banda borda (x prof)"
                            value={form.edge_band_factor}
                            onChange={(v) => setField("edge_band_factor", normalizeNumber(v))}
                            disabled={busy}
                            placeholder="ex: 1.5"
                        />
                        <Field
                            label="Banda topo (x prof)"
                            value={form.top_band_factor}
                            onChange={(v) => setField("top_band_factor", normalizeNumber(v))}
                            disabled={busy}
                            placeholder="ex: 1.5"
                        />
                    </div>
                </div>

                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={run}
                        disabled={!canRun || busy}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {busy ? (
                            <>
                                <RefreshCcw className="w-4 h-4 animate-spin" />
                                Gerando…
                            </>
                        ) : (
                            <>
                                <RefreshCcw className="w-4 h-4" />
                                Gerar sugestões
                            </>
                        )}
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                            if (currentSelected) pickSuggestion(currentSelected);
                        }}
                        disabled={!ranked.length || busy}
                        className="px-3 py-2 rounded-lg border border-slate-300 text-slate-800 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
                        title="Reaplicar sugestão selecionada"
                    >
                        Aplicar
                    </button>
                </div>

                {/* LISTA */}
                <div className="border-t border-slate-200 pt-3">
                    <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-bold text-slate-800">Sugestões</div>
                        <div className="text-[11px] text-slate-500">{ranked.length ? `${ranked.length} opções` : "—"}</div>
                    </div>

                    {!ranked.length ? (
                        <div className="text-xs text-slate-500">
                            Clique em <strong>Gerar sugestões</strong> para ver opções.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {ranked.map((r, idx) => (
                                <SuggestionRow key={r.id} r={r} idx={idx} selected={r.id === selectedId} onSelect={() => pickSuggestion(r)} />
                            ))}
                        </div>
                    )}
                </div>

                {/* RESUMO */}
                {currentSelected && (
                    <div className="border-t border-slate-200 pt-3">
                        <div className="text-xs font-bold text-slate-800 mb-2">
                            Selecionada: <span className="font-mono">{currentSelected.id}</span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-700">
                            <Mini label="Score" value={fmt(currentSelected.score, 3)} />
                            <Mini label="Strategy" value={String(currentSelected.strategy || "")} />
                            <Mini label="Variant" value={String(currentSelected.debug?.variant || "")} />
                            <Mini label="Ângulo" value={fmt(currentSelected.debug?.angle_deg, 2)} />

                            <Mini label="kx/ky" value={`${currentSelected.debug?.kx ?? "—"}/${currentSelected.debug?.ky ?? "—"}`} />
                            <Mini label="gapX/gapY" value={`${fmt(currentSelected.debug?.gapx, 1)}/${fmt(currentSelected.debug?.gapy, 1)}`} />

                            <Mini label="Quarteirões" value={String(currentSelected.metrics?.n_blocks ?? "—")} />
                            <Mini label="Política fileiras" value={String(currentSelected.debug?.rows_policy || "—")} />

                            <Mini label="Ratio vias" value={fmt(currentSelected.metrics?.ratio_vias, 3)} />
                            <Mini label="Área vias m²" value={Math.round(currentSelected.metrics?.roads_area_m2 || 0).toLocaleString("pt-BR")} />
                        </div>

                        <div className="mt-2 text-[11px] text-slate-500 leading-5">
                            *Cada opção já traz quarteirões (blocks_fc) e um programa por quarteirão (block_program).*
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function Field({ label, value, onChange, disabled, placeholder }) {
    return (
        <label className="text-[11px] text-slate-700">
            <div className="mb-1">{label}</div>
            <input
                className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
                value={value ?? ""}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                placeholder={placeholder}
            />
        </label>
    );
}

function Select({ label, value, onChange, disabled, options }) {
    return (
        <label className="text-[11px] text-slate-700 col-span-2">
            <div className="mb-1">{label}</div>
            <select
                className="w-full border border-slate-300 rounded px-2 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
                value={value ?? ""}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
            >
                {options.map((o) => (
                    <option key={o.value} value={o.value}>
                        {o.label}
                    </option>
                ))}
            </select>
        </label>
    );
}

function SuggestionRow({ r, idx, selected, onSelect }) {
    const score = Number.isFinite(Number(r?.score)) ? Number(r.score).toFixed(3) : "—";
    const ratio = Number.isFinite(Number(r?.metrics?.ratio_vias)) ? Number(r.metrics.ratio_vias).toFixed(3) : "—";

    const variant = String(r?.debug?.variant || "");
    const kx = r?.debug?.kx ?? "—";
    const ky = r?.debug?.ky ?? "—";
    const gapx = Number.isFinite(Number(r?.debug?.gapx)) ? Number(r.debug.gapx).toFixed(1) : "—";
    const gapy = Number.isFinite(Number(r?.debug?.gapy)) ? Number(r.debug.gapy).toFixed(1) : "—";
    const nBlocks = r?.metrics?.n_blocks ?? "—";

    return (
        <button
            type="button"
            onClick={onSelect}
            className={[
                "w-full text-left rounded-lg border px-3 py-2 transition",
                selected ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:bg-slate-50",
            ].join(" ")}
        >
            <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-slate-900">
                    {idx === 0 ? (
                        <span className="inline-flex items-center gap-1">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            Opção {idx + 1}
                        </span>
                    ) : (
                        <span>Opção {idx + 1}</span>
                    )}
                    <span className="ml-2 text-[11px] font-mono text-slate-500">{r.id}</span>
                </div>
                <div className="text-xs font-bold text-slate-900">Score {score}</div>
            </div>

            <div className="mt-1 grid grid-cols-4 gap-2 text-[11px] text-slate-700">
                <div>
                    <div className="text-slate-500">Estratégia</div>
                    <div className="font-semibold">{String(r.strategy || "")}</div>
                </div>
                <div>
                    <div className="text-slate-500">Variante</div>
                    <div className="font-semibold">{variant}</div>
                </div>
                <div>
                    <div className="text-slate-500">kx/ky</div>
                    <div className="font-semibold">
                        {kx}/{ky}
                    </div>
                </div>
                <div>
                    <div className="text-slate-500">gapX/gapY</div>
                    <div className="font-semibold">
                        {gapx}/{gapy}
                    </div>
                </div>
            </div>

            <div className="mt-1 text-[11px] text-slate-500">
                Ratio vias: <span className="font-semibold text-slate-700">{ratio}</span> · Quarteirões:{" "}
                <span className="font-semibold text-slate-700">{nBlocks}</span>
            </div>
        </button>
    );
}

function Mini({ label, value }) {
    return (
        <div className="border border-slate-200 rounded p-2">
            <div className="text-[10px] text-slate-500">{label}</div>
            <div className="text-[12px] font-bold text-slate-900">{value}</div>
        </div>
    );
}
