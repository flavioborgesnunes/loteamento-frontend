import React from "react";
import { GeoJSON } from "react-leaflet";
import * as turf from "@turf/turf";

/**
 * Camadas de Ruas (editáveis) + Máscara.
 *
 * Regras:
 * - Linha de rua: editável, clicável, deletável.
 * - Máscara: não é editável, mas pode ser deletada em modo "remoção" do Geoman.
 *   Ao deletar a máscara, removemos a rua associada via onRuaRemoved(uid).
 *
 * IMPORTANTE:
 *  - Para a máscara deletar só a rua correta, cada feature de ruaMask
 *    precisa ter `properties._rua_uid` setado no hook useRuas.
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
            {/* Máscara de RUAS — visual, mas deletável em modo remoção */}
            {ruaMask && (
                <GeoJSON
                    key={`ruaMask-${Math.round(turf.area(ruaMask))}`}
                    pane={paneMask}
                    data={ruaMask}
                    style={() => maskStyle}
                    // Ela não é "editável", mas precisa ser interativa para receber pm:remove
                    onEachFeature={(feature, layer) => {
                        try {
                            // Geoman não deve tentar editar a máscara
                            layer.options.pmIgnore = false;

                            // Quando usuário estiver em modo remoção e clicar na máscara,
                            // o Geoman dispara "pm:remove". Aqui ligamos isso a onRuaRemoved.
                            const ruaUid =
                                feature?.properties?._rua_uid ??
                                feature?.properties?._uid ??
                                null;

                            const onPmRemove = () => {
                                if (ruaUid != null) {
                                    onRuaRemoved(ruaUid);
                                }
                            };

                            layer.on("pm:remove", onPmRemove);
                        } catch {
                            // ignora erros
                        }
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
                                        layer.pm?.enable?.({
                                            snappable: true,
                                            snapDistance: 20,
                                        });
                                        layer.options.pmIgnore = false;
                                    } catch { }
                                }, 0);
                            });

                            // sync fim de edição (mover vértices, arrastar, etc.)
                            const syncEnd = () => {
                                try {
                                    const gj = layer.toGeoJSON();
                                    gj.properties = {
                                        ...(r.properties || {}),
                                        _uid: uid, // preserva identificador
                                    };
                                    onRuaEdited(uid, gj);
                                } catch (e) {
                                    console.error("[Ruas] sync rua fail:", e);
                                }
                            };

                            ["pm:markerdragend", "pm:editend", "pm:dragend"].forEach(
                                (ev) => layer.on(ev, syncEnd)
                            );

                            // Apagar rua (linha) – só essa rua
                            const onPmRemove = () => onRuaRemoved(uid);
                            layer.on("pm:remove", onPmRemove);

                            // Clique para editar largura da rua
                            layer.on("click", (e) => {
                                try {
                                    const map = layer._map;

                                    // Se estiver em modo de remoção global do Geoman,
                                    // não abre prompt de largura — deixa só apagar.
                                    if (
                                        map?.pm?.globalRemovalEnabled &&
                                        map.pm.globalRemovalEnabled()
                                    ) {
                                        return;
                                    }
                                } catch {
                                    // se der erro, segue o fluxo normal
                                }

                                const current = Number(
                                    r?.properties?.width_m ?? defaultRuaWidth
                                );
                                onRuaWidthPrompt(uid, current);
                            });
                        }}
                    />
                );
            })}
        </>
    );
}
