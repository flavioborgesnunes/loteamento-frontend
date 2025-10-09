import useAxios from "../../utils/useAxios";

/**
 * Hook de API para o módulo de Parcelamento.
 * Usa a instância autenticada retornada por useAxios() dentro do componente.
 *
 * Exemplo de uso:
 *   const { previewParcelamento, materializarParcelamento } = useParcelamentoApi();
 *   const data = await previewParcelamento(planoId, { alGeom, params });
 */
export default function useParcelamentoApi() {
    const axiosAuth = useAxios();

    // --- Planos ---
    async function listPlanos(params = {}) {
        // GET parcelamento/planos/?project=<id> (se você filtrar no backend)
        const { data } = await axiosAuth.get("parcelamento/planos/", { params });
        return data;
    }

    async function getPlano(planoId) {
        const { data } = await axiosAuth.get(`parcelamento/planos/${planoId}/`);
        return data;
    }

    async function createPlano(payload) {
        // payload: { project, nome?, ...params }
        const { data } = await axiosAuth.post("parcelamento/planos/", payload);
        return data;
    }

    // Conveniência: retorna um plano para o projeto; se não existir, cria
    async function getOrCreatePlanoForProject(projectId, defaults = {}) {
        const planos = await listPlanos(); // filtre no client por enquanto
        let plano = planos?.find?.((p) => String(p.project) === String(projectId));
        if (!plano) {
            plano = await createPlano({ project: projectId, ...defaults });
        }
        return plano;
    }

    // --- Preview & Materialização ---
    async function previewParcelamento(planoId, { alGeom, params, userEdits } = {}) {
        const body = {
            al_geom: alGeom,
            params: params || {},
            user_edits: userEdits || {},
        };
        const { data } = await axiosAuth.post(
            `parcelamento/planos/${planoId}/preview/`,
            body
        );
        return data; // { vias, quarteiroes, lotes, metrics }
    }

    async function materializarParcelamento(
        planoId,
        { alGeom, params, nota, isOficial, userEdits } = {}
    ) {
        const body = {
            al_geom: alGeom,
            params: params || {},
            nota: nota || "",
            is_oficial: !!isOficial,
            user_edits: userEdits || {},
        };
        const { data } = await axiosAuth.post(
            `parcelamento/planos/${planoId}/materializar/`,
            body
        );
        return data; // { versao_id, metrics }
    }

    // --- Versões ---
    async function listVersoes(params = {}) {
        const { data } = await axiosAuth.get("parcelamento/versoes/", { params });
        return data;
    }

    async function getVersao(versaoId) {
        const { data } = await axiosAuth.get(`parcelamento/versoes/${versaoId}/`);
        return data;
    }

    async function getVersaoGeojson(versaoId) {
        const { data } = await axiosAuth.get(
            `parcelamento/versoes/${versaoId}/geojson/`
        );
        return data; // { vias, quarteiroes, lotes }
    }

    async function exportVersaoKML(versaoId) {
        const { data } = await axiosAuth.post(
            `parcelamento/versoes/${versaoId}/kml/`
        );
        return data; // { kml_path }
    }

    return {
        // planos
        listPlanos,
        getPlano,
        createPlano,
        getOrCreatePlanoForProject,
        // fluxo principal
        previewParcelamento,
        materializarParcelamento,
        // versões
        listVersoes,
        getVersao,
        getVersaoGeojson,
        exportVersaoKML,
    };
}
