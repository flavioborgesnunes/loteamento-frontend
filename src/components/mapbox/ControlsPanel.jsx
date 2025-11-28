import Select from 'react-select';
import { useRef } from 'react';

export default function ControlsPanel({
    mapStyles,
    curvasProntas,
    curvasVisiveis,
    toggleCurvas,
    ltPronto,
    ltVisivel,
    toggleLT,
    MFPronto,
    MFVisivel,
    toggleMF,
    federalPronto,
    federalVisivel,
    toggleFederais,
    limitesCidadesPronto,
    limitesCidadesVisivel,
    toggleLimites,
    estados,
    ufSelecionado,
    setUfSelecionado,
    filtrarPorUF,
    onExportKML,
    onKMLorKMZUploadPrincipal,
    cidadesFiltradas,
    onCidadeSelecionada,
    riosPronto,
    riosVisivel,
    toggleRios,
    carregandoCidades,
    estadoSelecionado,
    setEstadoSelecionado,
    areasProntas,
    areasVisiveis,
    toggleAreasEstaduais,
    mudarEstiloMapa,
    // NOVO:
    onOpenKMLSecModal,
    secOverlays,
    setStyle = () => { },
    // 👇 novo prop para estilização externa
    className = "",
}) {
    const estadoOptions = Object.entries(estados).map(([label, value]) => ({
        label,
        value
    }));

    const cidadeOptions = (cidadesFiltradas || []).map(nome => ({
        label: nome,
        value: nome
    }));

    const uf = estadoSelecionado;

    const fileInputRef = useRef(null);

    const handleButtonClick = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click(); // dispara a janela de seleção
        }
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) onFileSelect(file);
    };

    return (
        <div
            className={`
                flex flex-col gap-3 justify-start items-start mt-3
                text-sm bg-white opacity-80 rounded-md
                ${className}
            `}
        >
            {/* Estilos de mapa */}
            {Object.entries(mapStyles).map(([name, url]) => (
                <button
                    key={name}
                    onClick={() => setStyle(url)}
                    className="bg-white px-3 py-1 rounded shadow hover:bg-gray-200 whitespace-nowrap"
                >
                    {name}
                </button>
            ))}


            <label className="hidden">
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".kml,.kmz"
                    onChange={onKMLorKMZUploadPrincipal}
                    className="hidden"
                />
            </label>

            {/* Dropdown Estado */}
            <div className="min-w-[200px]">
                <Select
                    placeholder="Selecione um estado"
                    options={estadoOptions}
                    onChange={(option) => {
                        if (option) {
                            setEstadoSelecionado(option.value);
                            setUfSelecionado(option.value);
                            filtrarPorUF(option.value);
                        }
                    }}
                    value={estadoOptions.find(e => e.value === uf) || null}
                    styles={{
                        container: (base) => ({ ...base, fontSize: '0.8rem' })
                    }}
                />

                {/* Botão dinâmico */}
                {uf && areasProntas[uf] === true && (
                    <button
                        onClick={() => toggleAreasEstaduais(uf)}
                        className={`
                            w-full mt-1 px-3 py-1 rounded text-white text-xs
                            ${areasVisiveis[uf] ? 'bg-green-700' : 'bg-green-500'}
                        `}
                    >
                        {areasVisiveis[uf] ? 'Ocultar' : 'Mostrar'} Áreas Estaduais ({uf})
                    </button>
                )}

                {uf && areasProntas[uf] === undefined && (
                    <p className="text-xs text-gray-400 mt-1">⏳ Carregando camada...</p>
                )}
            </div>

            {/* Dropdown Cidade */}
            <div className="min-w-[200px]">
                <Select
                    placeholder="Selecione a cidade"
                    options={cidadeOptions}
                    onChange={(option) => {
                        if (option) onCidadeSelecionada(option.value);
                    }}
                    isDisabled={!ufSelecionado}
                    styles={{
                        container: (base) => ({ ...base, fontSize: '0.8rem' })
                    }}
                />

                {carregandoCidades && (
                    <div className="flex items-center text-blue-600 text-xs mt-1">
                        <svg className="animate-spin h-3 w-3 mr-1" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        Carregando cidades...
                    </div>
                )}
            </div>

            <button
                onClick={() => fileInputRef.current.click()}
                className="bg-white px-3 py-1 rounded shadow hover:bg-gray-200 whitespace-nowrap"
            >
                ➕ KML Principal
            </button>


            <button
                onClick={onOpenKMLSecModal}
                className="bg-white px-3 py-1 rounded shadow hover:bg-gray-200 whitespace-nowrap"
            >
                ➕ KML Secundário
            </button>

            {/* chips de secundários já carregados */}
            {Array.isArray(secOverlays) && secOverlays.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                    {secOverlays.map((ov) => (
                        <span
                            key={ov.id}
                            className="inline-flex items-center gap-2 rounded-full border px-2 py-1 text-xs bg-white/80"
                            title={ov.id}
                        >
                            <span
                                className="inline-block h-3 w-3 rounded-full"
                                style={{ background: ov.color }}
                            />
                            {ov.name}
                        </span>
                    ))}
                </div>
            )}

            {/* Camadas */}
            <button
                onClick={toggleCurvas}
                disabled={!curvasProntas}
                className={`
                    px-3 py-1 rounded shadow hover:bg-gray-200 whitespace-nowrap
                    ${curvasVisiveis ? "bg-blue-100 text-blue-700" : "bg-white text-gray-800"}
                    disabled:opacity-50
                `}
            >
                {curvasVisiveis ? "👁️ Curvas de Nível" : "🚫 Curvas de Nível"}
            </button>

            <button
                onClick={toggleLT}
                disabled={!ltPronto}
                className={`
                    px-3 py-1 rounded shadow hover:bg-gray-200 whitespace-nowrap
                    ${ltVisivel ? "bg-blue-100 text-blue-700" : "bg-white text-gray-800"}
                    disabled:opacity-50
                `}
            >
                {ltVisivel ? "👁️ Linhas de Transmissão" : "🚫 Linhas de Transmissão"}
            </button>

            <button
                onClick={toggleMF}
                disabled={!MFPronto}
                className={`
                    px-3 py-1 rounded shadow hover:bg-gray-200 whitespace-nowrap
                    ${MFVisivel ? "bg-blue-100 text-blue-700" : "bg-white text-gray-800"}
                    disabled:opacity-50
                `}
            >
                {MFVisivel ? "👁️ Malha Ferroviária" : "🚫 Malha Ferroviária"}
            </button>

            <button
                onClick={toggleFederais}
                disabled={!federalPronto}
                className={`
                    px-3 py-1 rounded shadow hover:bg-gray-200 whitespace-nowrap
                    ${federalVisivel ? "bg-blue-100 text-blue-700" : "bg-white text-gray-800"}
                    disabled:opacity-50
                `}
            >
                {federalVisivel ? "👁️ Áreas Federais" : "🚫 Áreas Federais"}
            </button>

            <button
                onClick={toggleRios}
                disabled={!riosPronto}
                className={`
                    px-3 py-1 rounded shadow whitespace-nowrap
                    ${riosVisivel ? "bg-blue-100 text-blue-700" : 'bg-gray-200 text-black'}
                    disabled:opacity-50
                `}
            >
                {riosVisivel ? '👁️ Rios' : '🚫 Rios'}
            </button>

            <button
                onClick={toggleLimites}
                disabled={!limitesCidadesPronto}
                className={`
                    px-3 py-1 rounded shadow whitespace-nowrap
                    ${limitesCidadesVisivel ? 'bg-green-600 text-white' : 'bg-gray-200 text-black'}
                    disabled:opacity-50
                `}
            >
                {limitesCidadesVisivel ? '👁️ Municípios' : '🚫 Municípios'}
            </button>

        </div>
    );
}
