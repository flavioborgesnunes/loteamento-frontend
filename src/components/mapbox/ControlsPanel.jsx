import Select from 'react-select';

export default function ControlsPanel({
    mapStyles,
    curvasProntas,
    curvasVisiveis,
    toggleCurvas,
    ltPronto,
    ltVisivel,
    toggleLT,
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
    onKMLUpload,
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
    map,
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



    return (
        <>
            <div className='flex flex-wrap gap-5 justify-between p-3 items-center'>

                {/* Estilos de mapa */}
                {Object.entries(mapStyles).map(([name, url]) => (
                    <button key={name} onClick={() => mudarEstiloMapa(url, ufSelecionado)} className="bg-white px-3 py-1 rounded shadow hover:bg-gray-200">
                        {name}
                    </button>
                ))}

                {/* Ações de KML */}
                <label className="bg-gradient-to-r from-padrao-100 to-padrao-900 px-3 py-1 text-white rounded shadow cursor-pointer">
                    Abrir KML
                    <input type="file" accept=".kml" onChange={onKMLUpload} className="hidden" />
                </label>

                <button onClick={onExportKML} className="bg-white px-3 py-1 rounded shadow hover:bg-gray-200">
                    Exportar KML
                </button>

                {/* Camadas */}
                <button onClick={toggleCurvas} disabled={!curvasProntas}
                    className={`px-3 py-1 rounded shadow hover:bg-gray-200 ${curvasVisiveis ? "bg-blue-100 text-blue-700" : "bg-white text-gray-800"}`}>
                    {curvasVisiveis ? "👁️ Curvas de Nível" : "🚫 Curvas de Nível"}
                </button>

                <button onClick={toggleLT} disabled={!ltPronto}
                    className={`px-3 py-1 rounded shadow hover:bg-gray-200 ${ltVisivel ? "bg-blue-100 text-blue-700" : "bg-white text-gray-800"}`}>
                    {ltVisivel ? "👁️ Linhas de Transmissão" : "🚫 Linhas de Transmissão"}
                </button>

                <button onClick={toggleFederais} disabled={!federalPronto}
                    className={`px-3 py-1 rounded shadow hover:bg-gray-200 ${federalVisivel ? "bg-blue-100 text-blue-700" : "bg-white text-gray-800"}`}>
                    {federalVisivel ? "👁️ Áreas Federais" : "🚫 Áreas Federais"}
                </button>

                <button onClick={toggleLimites} disabled={!limitesCidadesPronto}
                    className={`px-3 py-1 rounded shadow ${limitesCidadesVisivel ? 'bg-green-600 text-white' : 'bg-gray-200 text-black'} disabled:opacity-50`}>
                    {limitesCidadesVisivel ? '👁️ Municípios' : '🚫 Municípios'}
                </button>


                <button onClick={toggleRios} disabled={!riosPronto}
                    className={`px-3 py-1 rounded shadow ${riosVisivel ? 'bg-green-600 text-white' : 'bg-gray-200 text-black'} disabled:opacity-50`}>
                    {riosVisivel ? '👁️ Rios' : '🚫 Rios'}
                </button>

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
                    />

                    {/* Botão dinâmico */}
                    {uf && areasProntas[uf] === true && (
                        <button
                            onClick={() => toggleAreasEstaduais(uf)}
                            className={`w-full px-3 py-2 rounded text-white ${areasVisiveis[uf] ? 'bg-green-700' : 'bg-green-500'
                                }`}
                        >
                            {areasVisiveis[uf] ? 'Ocultar' : 'Mostrar'} Áreas Estaduais ({uf})
                        </button>
                    )}

                    {uf && areasProntas[uf] === false && (
                        <p>
                        </p>
                    )}

                    {uf && areasProntas[uf] === undefined && (
                        <p className="text-sm text-gray-400">⏳ Carregando camada...</p>
                    )}
                </div>

                {/* Dropdown Cidade */}
                <div className="min-w-[200px]">
                    <Select
                        placeholder="Selecione a cidade"
                        options={(cidadesFiltradas || []).map(nome => ({
                            label: nome,
                            value: nome
                        }))}
                        onChange={(option) => {
                            if (option) onCidadeSelecionada(option.value);
                        }}
                        isDisabled={!ufSelecionado}
                    />

                    {carregandoCidades && (
                        <div className="flex items-center text-blue-600 text-sm mt-1">
                            <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                            </svg>
                            Carregando cidades...
                        </div>
                    )}

                </div>
            </div>
        </>
    );
}
