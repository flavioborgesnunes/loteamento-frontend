// src/pages/parcelamento-ia/parcelamentoBlocosApi.js
import useAxios from "../../utils/useAxios";

export default function useParcelamentoBlocosApi() {
    const axiosAuth = useAxios();

    async function gerarQuarteiroesIncremental({
        restricoesId,
        versaoId = null,
        linhaBase = null,
        params = {},
        maxQuarteiroes = 1,
    }) {
        if (!restricoesId) throw new Error("restricoesId é obrigatório.");

        const startNewPhase = !!params?.start_new_phase;

        // Linha base obrigatória:
        // - na criação
        // - OU ao iniciar nova fase (trocar linha base)
        if ((!versaoId || startNewPhase) && !linhaBase?.geometry) {
            throw new Error(
                "Linha base é obrigatória para criar a primeira versão ou para iniciar nova fase (start_new_phase=true)."
            );
        }

        const payload = {
            restricoes_id: Number(restricoesId),
            versao_id: versaoId ? Number(versaoId) : null,

            // ✅ AQUI é o FIX: manda linha_base também quando start_new_phase=true
            linha_base: (!versaoId || startNewPhase) ? linhaBase : null,

            max_quarteiroes: Number(maxQuarteiroes || 1),
            params: { ...params },
        };

        console.log("[gerarQuarteiroesIncremental] startNewPhase:", startNewPhase);
        console.log("[gerarQuarteiroesIncremental] linha_base enviada?", !!payload.linha_base);
        console.log("[gerarQuarteiroesIncremental] payload:", payload);

        const { data } = await axiosAuth.post("/parcelamento-blocos/preview/", payload);
        return data;
    }

    return { gerarQuarteiroesIncremental };
}
