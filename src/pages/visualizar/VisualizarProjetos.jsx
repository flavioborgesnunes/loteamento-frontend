// ProjectsPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import * as turf from "@turf/turf";
import useAxios from "../../utils/useAxios";
import "mapbox-gl/dist/mapbox-gl.css";
import Swal from "sweetalert2";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

// Helpers Mapbox
function ensureSource(map, id, data) {
    if (!map.getSource(id)) map.addSource(id, { type: "geojson", data });
    else map.getSource(id).setData(data);
}
function ensureLayer(map, def) {
    if (!map.getLayer(def.id)) map.addLayer(def);
}

const secPalette = ["#ff4d4f", "#52c41a", "#faad14", "#722ed1", "#13c2c2", "#eb2f96", "#1890ff", "#a0d911"];
const pickColor = (i) => secPalette[i % secPalette.length];

// Helpers:
// ids seguros p/ source/layer
const slugifyId = (s) =>
    `ov_${String(s || "")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9_-]+/g, "_")
        .replace(/^_+|_+$/g, "")}`;

// seta visibilidade das duas layers do overlay
function setOverlayVisibility(map, overlayId, visible) {
    const sid = slugifyId(overlayId);
    const fillId = `${sid}-fill`;
    const lineId = `${sid}-line`;
    const v = visible ? "visible" : "none";
    if (map.getLayer(fillId)) map.setLayoutProperty(fillId, "visibility", v);
    if (map.getLayer(lineId)) map.setLayoutProperty(lineId, "visibility", v);
}

// cria/atualiza source+layers e garante visível
function upsertOverlay(map, overlayId, fc, color) {
    const sid = slugifyId(overlayId);
    ensureSource(map, sid, fc);

    // fill para Polygon/MultiPolygon (com contorno)
    ensureLayer(map, {
        id: `${sid}-fill`,
        type: "fill",
        source: sid,
        paint: { "fill-color": color, "fill-opacity": 0.2, "fill-outline-color": color },
        filter: ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false],
    });

    // line para LineString/MultiLineString
    ensureLayer(map, {
        id: `${sid}-line`,
        type: "line",
        source: sid,
        paint: { "line-color": color, "line-width": 2 },
        filter: ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
    });

    // 🔑 força visível mesmo se a layer já existia com 'none'
    setOverlayVisibility(map, overlayId, true);
}

// --- Permissão/alerta ---
const isProjectEditor = (user, proj) => {
    if (!user || !proj) return false;
    // superuser/staff sempre podem
    if (user.is_superuser || user.is_staff) return true;
    // dono ou owner do projeto
    const uid = String(user.id);
    return uid === String(proj.dono) || uid === String(proj.owner) || (user.role === "dono" && uid === String(proj.dono));
};

const ownerLabelFrom = (proj) => {
    if (!proj) return "usuário autorizado";

    const name = proj.owner_nome || proj.dono_nome;
    const email = proj.owner_email || proj.dono_email;

    if (name) return `usuário ${name}`;
    if (email) return `usuário ${email}`;
    if (proj.owner) return `usuário #${proj.owner}`;
    if (proj.dono) return `usuário #${proj.dono}`;
    return "usuário autorizado";
};

const denyEditAlert = (proj) => {
    const who = ownerLabelFrom(proj);
    return Swal.fire({
        icon: "warning",
        title: "Permissão negada",
        text: `Somente o ${who} pode alterar esse projeto.`,
        confirmButtonText: "OK",
    });
};


export default function VisualizarProjetos() {
    const axiosAuth = useAxios(); // injeta Authorization automaticamente

    // Map
    const mapRef = useRef(null);
    const mapContainerRef = useRef(null);
    const [mapReady, setMapReady] = useState(false);

    // Autenticação/Usuário
    const [me, setMe] = useState(null); // { id, role, dono, ... }
    const myDonoId = useMemo(() => {
        if (!me) return null;
        return me?.role === "dono" ? me?.id : me?.dono;
    }, [me]);

    // Projetos / seleção
    const [projects, setProjects] = useState([]);
    const [loadingList, setLoadingList] = useState(false);
    const myProjects = useMemo(() => {
        if (!myDonoId) return projects;
        return projects.filter((p) => String(p.dono) === String(myDonoId));
    }, [projects, myDonoId]);

    const [selectedId, setSelectedId] = useState("");

    // CRUD form
    const [form, setForm] = useState({ name: "", description: "", uf: "" });
    const [editingId, setEditingId] = useState(null);

    // Summary & overlays
    const [summary, setSummary] = useState(null); // { id, name, aoi, layer_flags, overlays: [...] }
    const [overlayStates, setOverlayStates] = useState({}); // overlay_id -> { loaded, visible, color }

    // Base layer toggles (somente as que vierem salvas no projeto)
    const allowedBaseKeys = useMemo(
        () => Object.entries(summary?.layer_flags || {}).filter(([, v]) => !!v).map(([k]) => k),
        [summary]
    );
    const [baseFlags, setBaseFlags] = useState({});
    useEffect(() => {
        if (!summary) return;
        const initial = {};
        for (const k of allowedBaseKeys) {
            initial[k] = !!summary.layer_flags[k];
        }
        setBaseFlags(initial);
    }, [summary, allowedBaseKeys]);

    // Init map
    useEffect(() => {
        if (mapRef.current) return;
        const map = new mapboxgl.Map({
            container: mapContainerRef.current,
            style: "mapbox://styles/mapbox/streets-v12",
            center: [-55, -14],
            zoom: 3,
        });
        mapRef.current = map;
        map.addControl(new mapboxgl.NavigationControl(), "top-right");
        map.on("load", () => setMapReady(true));
    }, []);

    // Carrega user (para saber o dono) e projetos
    useEffect(() => {
        (async () => {
            try {
                const [{ data: user }, { data: list }] = await Promise.all([
                    axiosAuth.get("user/"),
                    axiosAuth.get("projetos/"),
                ]);
                setMe(user);
                setProjects(list);
            } catch (e) {
                console.error(e);
                alert("Erro ao carregar usuário/projetos (faça login).");
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function fetchProjects() {
        setLoadingList(true);
        try {
            const { data } = await axiosAuth.get("projetos/");
            setProjects(data);
        } catch (e) {
            console.error(e);
            alert("Erro ao listar projetos.");
        } finally {
            setLoadingList(false);
        }
    }

    async function openProject(projId) {
        if (!projId) return;
        setSelectedId(String(projId));
        setSummary(null);
        setOverlayStates({});
        try {
            const { data } = await axiosAuth.get(`projetos/${projId}/map/summary/`);
            setSummary(data);

            // pinta AOI (inalterado)
            if (mapReady && data.aoi) {
                const map = mapRef.current;
                const fc = { type: "FeatureCollection", features: [{ type: "Feature", geometry: data.aoi, properties: {} }] };
                ensureSource(map, "aoi_src", fc);
                ensureLayer(map, {
                    id: "aoi-fill",
                    type: "fill",
                    source: "aoi_src",
                    paint: { "fill-color": "#00aaff", "fill-opacity": 0.15 },
                    filter: ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false],
                });
                ensureLayer(map, {
                    id: "aoi-line",
                    type: "line",
                    source: "aoi_src",
                    paint: { "line-color": "#0080ff", "line-width": 2 },
                    filter: ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false],
                });
                try {
                    const bbox = turf.bbox(fc);
                    map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 40, duration: 0 });
                } catch { }
            }

            // 1) estados locais de overlays: já começam VISÍVEIS
            const ovInit = {};
            (data.overlays || []).forEach((o, i) => {
                ovInit[o.overlay_id] = { loaded: false, visible: true, color: o.color || pickColor(i) };
            });
            setOverlayStates(ovInit);

            // 2) pré-carrega tudo no mapa para entrar visível
            if (mapReady && (data.overlays || []).length) {
                const map = mapRef.current;
                for (let i = 0; i < data.overlays.length; i++) {
                    const o = data.overlays[i];
                    const color = ovInit[o.overlay_id].color;
                    const fc = await loadOverlayGeoJSON(data.id, o.overlay_id);
                    upsertOverlay(map, o.overlay_id, fc, color); // 👈 sempre entra visível
                }
                // marca como carregados
                setOverlayStates(prev =>
                    Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, { ...v, loaded: true, visible: true }]))
                );
            }

        } catch (e) {
            console.error(e);
            alert("Erro ao abrir projeto.");
        }
    }

    async function loadOverlayGeoJSON(projId, overlayId) {
        const { data } = await axiosAuth.get(`projetos/${projId}/features/`, {
            params: { overlay_id: overlayId, simplified: true },
        });
        return data;
    }

    async function toggleOverlay(overlayId) {
        if (!summary) return;
        const st = overlayStates[overlayId] || {};
        const nextVisible = !st.visible;
        const map = mapRef.current;
        const color = st.color || "#1890ff";

        if (!st.loaded) {
            const fc = await loadOverlayGeoJSON(summary.id, overlayId);
            upsertOverlay(map, overlayId, fc, color);
        } else {
            setOverlayVisibility(map, overlayId, nextVisible);
        }

        setOverlayStates(prev => ({
            ...prev,
            [overlayId]: { ...(prev[overlayId] || {}), loaded: true, visible: nextVisible },
        }));
    }

    // === GUARD DE PERMISSÃO (SweetAlert) PARA AÇÕES DE OVERLAY ===
    async function renameOverlay(overlayId, newId) {
        // 🚫 bloqueio por permissão
        if (!isProjectEditor(me, summary)) {
            await denyEditAlert(summary);
            return;
        }
        if (!newId || newId === overlayId) return;
        try {
            await axiosAuth.patch(`projetos/${summary.id}/overlay/`, { overlay_id: overlayId, new_overlay_id: newId });
            // remove camadas antigas no mapa
            const map = mapRef.current;
            const srcId = `ov_${overlayId}`;
            ["-fill", "-line"].forEach((suf) => {
                const lid = `${srcId}${suf}`;
                if (map.getLayer(lid)) map.removeLayer(lid);
            });
            if (map.getSource(srcId)) map.removeSource(srcId);

            // atualiza summary/estado
            setSummary((prev) => ({
                ...prev,
                overlays: (prev.overlays || []).map((o) => (o.overlay_id === overlayId ? { ...o, overlay_id: newId } : o)),
            }));
            setOverlayStates((prev) => {
                const { [overlayId]: old, ...rest } = prev;
                return { ...rest, [newId]: { ...(old || {}), loaded: false, visible: false } };
            });
            alert("Overlay renomeado.");
        } catch (e) {
            console.error(e);
            alert("Erro ao renomear overlay.");
        }
    }

    async function recolorOverlay(overlayId, color) {
        // 🚫 bloqueio por permissão
        if (!isProjectEditor(me, summary)) {
            await denyEditAlert(summary);
            return;
        }
        try {
            await axiosAuth.patch(`projetos/${summary.id}/overlay/`, { overlay_id: overlayId, color });
            // atualiza cor no mapa
            const map = mapRef.current;
            const srcId = `ov_${overlayId}`;
            const fillId = `${srcId}-fill`;
            const lineId = `${srcId}-line`;
            if (map.getLayer(fillId)) map.setPaintProperty(fillId, "fill-color", color);
            if (map.getLayer(lineId)) map.setPaintProperty(lineId, "line-color", color);

            setOverlayStates((prev) => ({ ...prev, [overlayId]: { ...(prev[overlayId] || {}), color } }));
            alert("Cor atualizada.");
        } catch (e) {
            console.error(e);
            alert("Erro ao atualizar cor.");
        }
    }

    async function deleteOverlay(overlayId) {
        // 🚫 bloqueio por permissão
        if (!isProjectEditor(me, summary)) {
            await denyEditAlert(summary);
            return;
        }
        if (!confirm(`Remover overlay "${overlayId}"?`)) return;
        try {
            await axiosAuth.delete(`projetos/${summary.id}/overlay/delete/`, {
                params: { overlay_id: overlayId },
            });

            // remove do mapa
            const map = mapRef.current;
            const srcId = `ov_${overlayId}`;
            ["-fill", "-line"].forEach((suf) => {
                const lid = `${srcId}${suf}`;
                if (map.getLayer(lid)) map.removeLayer(lid);
            });
            if (map.getSource(srcId)) map.removeSource(srcId);

            // atualiza UI
            setSummary((prev) => ({ ...prev, overlays: (prev.overlays || []).filter((o) => o.overlay_id !== overlayId) }));
            setOverlayStates((prev) => {
                const { [overlayId]: _, ...rest } = prev;
                return rest;
            });

            alert("Overlay removido.");
        } catch (e) {
            console.error(e);
            alert("Erro ao remover overlay.");
        }
    }

    // Base layers — só cria ações para as chaves permitidas
    function toggleBase(flagKey) {
        if (!allowedBaseKeys.includes(flagKey)) return;
        const next = !baseFlags[flagKey];
        setBaseFlags((prev) => ({ ...prev, [flagKey]: next }));
        const map = mapRef.current;

        // Exemplo funcional para RIOS usando Mapbox Streets
        if (flagKey === "rios") {
            if (!map.getSource("mapbox-streets")) {
                map.addSource("mapbox-streets", { type: "vector", url: "mapbox://mapbox.mapbox-streets-v8" });
            }
            if (!map.getLayer("rios-mapbox")) {
                map.addLayer({
                    id: "rios-mapbox",
                    type: "line",
                    source: "mapbox-streets",
                    "source-layer": "waterway",
                    filter: ["in", "class", "river", "stream", "canal", "drain", "ditch"],
                    layout: { visibility: "none" },
                    paint: { "line-color": "#0088ff", "line-width": 2 },
                });
            }
            map.setLayoutProperty("rios-mapbox", "visibility", next ? "visible" : "none");
            return;
        }

        // TODO: plugue seus tiles para lt/mf/cidades/limites_federais/areas_estaduais
    }

    // CRUD Projeto
    async function createProject() {
        try {
            await axiosAuth.post("projetos/", form);
            setForm({ name: "", description: "", uf: "" });
            fetchProjects();
            alert("Projeto criado (sem AOI/overlays). Para criar com AOI/overlays use o botão Exportar no mapa.");
        } catch (e) {
            console.error(e);
            alert("Erro ao criar projeto.");
        }
    }

    async function saveProject() {
        if (!editingId) return;
        // 🚫 bloqueio por permissão (caso alguém entre em modo edição sem poder)
        const proj = projects.find((p) => String(p.id) === String(editingId));
        if (proj && !isProjectEditor(me, proj)) {
            await denyEditAlert(proj);
            return;
        }
        try {
            await axiosAuth.patch(`projetos/${editingId}/`, form);
            setEditingId(null);
            setForm({ name: "", description: "", uf: "" });
            fetchProjects();
            if (String(selectedId) === String(editingId)) openProject(editingId);
            alert("Projeto atualizado.");
        } catch (e) {
            console.error(e);
            alert("Erro ao atualizar projeto.");
        }
    }

    async function deleteProject(id) {
        const proj = projects.find((p) => String(p.id) === String(id));
        // 🚫 bloqueio por permissão na exclusão via lista
        if (proj && !isProjectEditor(me, proj)) {
            await denyEditAlert(proj);
            return;
        }
        if (!confirm("Excluir projeto? Esta ação é irreversível.")) return;
        try {
            await axiosAuth.delete(`projetos/${id}/`);
            if (String(selectedId) === String(id)) {
                setSelectedId("");
                setSummary(null);
            }
            fetchProjects();
            alert("Projeto excluído.");
        } catch (e) {
            console.error(e);
            alert("Erro ao excluir projeto.");
        }
    }

    function startEdit(p) {
        setEditingId(p.id);
        setForm({ name: p.name, description: p.description || "", uf: p.uf || "" });
    }

    // Wrappers de UI para lista (usam SweetAlert quando não tem permissão)
    function handleStartEdit(p) {
        if (!isProjectEditor(me, p)) {
            denyEditAlert(p);
            return;
        }
        startEdit(p);
    }

    function handleDeleteProject(p) {
        if (!isProjectEditor(me, p)) {
            denyEditAlert(p);
            return;
        }
        deleteProject(p.id);
    }

    return (
        <div className="flex gap-4 p-4 mt-36">
            {/* Coluna esquerda: lista + EDITAR (sem criação) */}
            <div className="w-[380px] shrink-0 space-y-4">
                <h2 className="text-lg font-semibold">Projetos</h2>

                <div className="space-y-2">
                    {loadingList && <div>Carregando...</div>}
                    {projects.map((p) => (
                        <div
                            key={p.id}
                            className={`border rounded p-2 ${String(selectedId) === String(p.id) ? "border-blue-500" : "border-gray-200"}`}
                        >
                            <div className="flex justify-between items-center">
                                <button
                                    className="font-medium text-left"
                                    onClick={() => openProject(p.id)}
                                    title={`Abrir ${p.name}`}
                                >
                                    {p.name}
                                </button>
                                <div className="flex gap-2">
                                    <button onClick={() => handleStartEdit(p)} className="text-xs px-2 py-1 rounded bg-yellow-100">
                                        Editar
                                    </button>
                                    <button onClick={() => handleDeleteProject(p)} className="text-xs px-2 py-1 rounded bg-red-100">
                                        Excluir
                                    </button>
                                </div>
                            </div>
                            <div className="text-xs text-gray-600">
                                UF: {p.uf || "-"} • Dono #{p.dono} • Owner: {p.owner_nome}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Somente editar; criação removida */}
                <div className="border-t pt-3">
                    <h3 className="font-semibold text-sm mb-1">Editar projeto</h3>
                    {editingId ? (
                        <div className="space-y-2">
                            <input
                                className="w-full border rounded px-2 py-1 text-sm"
                                placeholder="Nome"
                                value={form.name}
                                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                            />
                            <input
                                className="w-full border rounded px-2 py-1 text-sm"
                                placeholder="Descrição"
                                value={form.description}
                                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                            />
                            <input
                                className="w-full border rounded px-2 py-1 text-sm"
                                placeholder="UF (ex.: SC)"
                                value={form.uf}
                                onChange={(e) => setForm((f) => ({ ...f, uf: e.target.value.toUpperCase().slice(0, 2) }))}
                            />
                            <div className="flex gap-2">
                                <button onClick={saveProject} className="flex-1 bg-blue-600 text-white rounded py-1 text-sm">
                                    Salvar alterações
                                </button>
                                <button
                                    onClick={() => { setEditingId(null); setForm({ name: "", description: "", uf: "" }); }}
                                    className="flex-1 bg-gray-100 rounded py-1 text-sm"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    ) : (
                        <p className="text-xs text-gray-500">
                            Selecione um projeto na lista e clique em <b>Editar</b> para alterar nome/descrição/UF.
                        </p>
                    )}
                </div>
            </div>

            {/* Coluna direita: mapa + controles do projeto aberto */}
            <div className="flex-1 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <h2 className="text-lg font-semibold">
                        {summary ? `Projeto: ${summary.name}` : "Abra um projeto"}
                    </h2>

                    {/* Dropdown: projetos do mesmo dono do projeto aberto (quando houver); senão todos */}
                    <div className="flex items-center gap-2">
                        {(() => {
                            const currentDonoId = projects.find((p) => String(p.id) === String(selectedId))?.dono;
                            const list = currentDonoId ? projects.filter((p) => p.dono === currentDonoId) : projects;
                            return (
                                <select
                                    className="border rounded px-2 py-1 text-sm"
                                    title="Abrir projeto"
                                    value={selectedId ?? ""}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (!val) return;
                                        openProject(Number(val));
                                    }}
                                >
                                    <option value="" disabled>
                                        Selecionar projeto…
                                    </option>
                                    {list.map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {p.name} {p.uf ? `• ${p.uf}` : ""}
                                        </option>
                                    ))}
                                </select>
                            );
                        })()}
                    </div>
                </div>

                {/* Mapa */}
                <div ref={mapContainerRef} className="w-full h-[560px] rounded-lg border" />

                {/* Overlays salvos do projeto */}
                {summary && (
                    <div className="space-y-2">
                        <h3 className="font-semibold">Overlays salvos</h3>
                        <div className="flex flex-wrap gap-2">
                            {(summary.overlays || []).map((o, i) => {
                                const st = overlayStates[o.overlay_id] || {};
                                const colorPick = st.color || o.color || ["#ff4d4f", "#52c41a", "#faad14", "#722ed1", "#13c2c2", "#eb2f96", "#1890ff", "#a0d911"][i % 8];
                                return (
                                    <div key={o.overlay_id} className="border rounded px-2 py-2">
                                        <div className="flex items-center gap-2">
                                            <span className="inline-block h-3 w-3 rounded-full" style={{ background: colorPick }} />
                                            <button className="font-medium text-sm" onClick={() => toggleOverlay(o.overlay_id)}>
                                                {st.visible ? "Ocultar" : "Mostrar"} — {o.overlay_id} ({o.count})
                                            </button>
                                        </div>

                                        <div className="flex items-center gap-2 mt-2">
                                            <input
                                                className="border rounded px-2 py-1 text-xs"
                                                placeholder="Renomear"
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") renameOverlay(o.overlay_id, e.currentTarget.value.trim());
                                                }}
                                            />
                                            <input
                                                type="color"
                                                value={colorPick}
                                                onChange={(e) => recolorOverlay(o.overlay_id, e.target.value)}
                                                title="Cor"
                                            />
                                            <button
                                                onClick={() => deleteOverlay(o.overlay_id)}
                                                className="text-xs px-2 py-1 rounded bg-red-100"
                                            >
                                                Excluir
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
