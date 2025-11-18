import useAxios from "../../utils/useAxios";

export default function useIaParcelamentoApi() {
    const axiosAuth = useAxios();

    async function sugerirParametros(planoId, payload) {
        const { data } = await axiosAuth.post(
            `/ia-parcelamento/planos/${planoId}/sugerir-parametros/`,
            payload
        );
        return data;
    }

    async function previewIa(planoId, payload) {
        const { data } = await axiosAuth.post(
            `/ia-parcelamento/planos/${planoId}/preview/`,
            payload
        );
        return data;
    }

    async function svgPreviewIa(planoId, payload) {
        const { data } = await axiosAuth.post(
            `/ia-parcelamento/planos/${planoId}/svg-preview/`,
            payload
        );
        return data;
    }

    return {
        sugerirParametros,
        previewIa,
        svgPreviewIa,
    };
}
