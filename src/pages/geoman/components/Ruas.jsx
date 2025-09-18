import React from "react";
import { GeoJSON, Pane } from "react-leaflet";
import * as turf from "@turf/turf";

/**
 * Camadas de Ruas (editáveis) + Máscara (sempre visível).
 * Importante: só escuta "pm:remove" (e não "remove") pra não apagar no re-render.
 */
export default function Ruas({
    ruas = [],
    ruaMask = null,
    defaultRuaWidth = 12,
    onRuaEdited = () => { },
    onRuaRemoved = () => { },
    onRuaWidthPrompt = () => { },
    paneRuas = "pane-ruas",
    paneMask = "pane-restricoes",
    ruaStyle = { color: "#333", weight: 3, opacity: 1 },
    maskStyle = {
        color: "#111",
        weight: 2,
        dashArray: "6 3",
        fillColor: "#999",
        fillOpacity: 0.35,
    },
}) {
    return (
        <>
            {/* Máscara de RUAS — sempre visível se existir */}
            {ruaMask && (
                <GeoJSON
                    key={`ruaMask-${Math.round(turf.area(ruaMask))}`}
                    pane={paneMask}
                    data={ruaMask}
                    style={() => maskStyle}
                    eventHandlers={{
                        add: (e) => {
                            try {
                                e.target.options.pmIgnore = true;
                                e.target.bringToFront?.();
                            } catch { }
                        },
                    }}
                />
            )}

            {/* RUAS editáveis */}
            {ruas.map((r, i) => {
                const uid = r?.properties?._uid ?? i;
                return (
                    <GeoJSON
                        pane={paneRuas}
                        key={`rua-${uid}`}
                        data={r}
                        style={() => ruaStyle}
                        onEachFeature={(feature, layer) => {
                            // habilita edição quando a camada entrar no mapa
                            layer.once("add", () => {
                                setTimeout(() => {
                                    try {
                                        layer.pm?.enable?.({ snappable: true, snapDistance: 20 });
                                        layer.options.pmIgnore = false;
                                    } catch { }
                                }, 0);
                            });

                            // sync fim de edição
                            const syncEnd = () => {
                                try {
                                    const gj = layer.toGeoJSON();
                                    gj.properties = { ...(r.properties || {}), _uid: uid }; // preserva width_m
                                    onRuaEdited(uid, gj);
                                } catch (e) {
                                    console.error("[Ruas] sync rua fail:", e);
                                }
                            };

                            // Apenas eventos Geoman de término
                            ["pm:markerdragend", "pm:editend", "pm:dragend"].forEach((ev) =>
                                layer.on(ev, syncEnd)
                            );

                            // Apagar rua (vínculo rua⇄máscara garantido pela recomputação)
                            const onPmRemove = () => onRuaRemoved(uid);
                            layer.on("pm:remove", onPmRemove);
                            // NÃO usar "remove" aqui (dispara em re-render!)

                            // Clique para editar largura por rua
                            layer.on("click", () => {
                                const current = Number(r?.properties?.width_m ?? defaultRuaWidth);
                                onRuaWidthPrompt(uid, current);
                            });
                        }}
                    />
                );
            })}
        </>
    );
}
