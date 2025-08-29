import Select from 'react-select';

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
    setStyle = () => { }
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
                    <button
                        key={name}
                        onClick={() => setStyle(url)}
                        className="bg-white px-3 py-1 rounded shadow hover:bg-gray-200"
                    >
                        {name}
                    </button>
                ))}

                {/* Ações de KML */}
                <label>KML Principal</label>
                <input
                    type="file"
                    accept=".kml,.kmz,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz"
                    onChange={onKMLorKMZUploadPrincipal}
                    className="text-sm"
                />

                <button
                    onClick={onOpenKMLSecModal}
                    className="bg-white px-3 py-1 rounded shadow hover:bg-gray-200"
                >
                    ➕ Adicionar KML Secundário
                </button>

                {/* <button
                    onClick={onExportKML}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm py-1 px-3 rounded"
                >
                    📤 Exportar KML Final
                </button> */}

                {/*chips de secundários já carregados */}
                {Array.isArray(secOverlays) && secOverlays.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                        {secOverlays.map((ov, i) => (
                            <span
                                key={ov.id}
                                className="inline-flex items-center gap-2 rounded-full border px-2 py-1 text-sm"
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
                <button onClick={toggleCurvas} disabled={!curvasProntas}
                    className={`px-3 py-1 rounded shadow hover:bg-gray-200 ${curvasVisiveis ? "bg-blue-100 text-blue-700" : "bg-white text-gray-800"}`}>
                    {curvasVisiveis ? "👁️ Curvas de Nível" : "🚫 Curvas de Nível"}
                </button>

                <button onClick={toggleLT} disabled={!ltPronto}
                    className={`px-3 py-1 rounded shadow hover:bg-gray-200 ${ltVisivel ? "bg-blue-100 text-blue-700" : "bg-white text-gray-800"}`}>
                    {ltVisivel ? "👁️ Linhas de Transmissão" : "🚫 Linhas de Transmissão"}
                </button>

                <button onClick={toggleMF} disabled={!MFPronto}
                    className={`px-3 py-1 rounded shadow hover:bg-gray-200 ${MFVisivel ? "bg-blue-100 text-blue-700" : "bg-white text-gray-800"}`}>
                    {MFVisivel ? "👁️ Malha Ferroviária" : "🚫 Malha Ferroviária"}
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
