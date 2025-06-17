import { useAuthStore } from '../../store/auth';
import { ArrowLeft, GripVertical } from 'lucide-react';
import MapComponent from '../../components/MapBoxComponent';
import { Bell, User, Settings, CircleUserRound } from 'lucide-react';

import ImgEstudo from './images/img-estudo.png'

function Estudo() {
    const user = useAuthStore(state => state.allUserData);
    const perfilUser = useAuthStore(state => state.perfilUser);


    return (
        <>
            <form className="w-full mt-10 shadow-md bg-white rounded-2xl p-5">
                <div className="grid grid-cols-2">
                    <div className="px-4">
                        <ArrowLeft />
                        <div className='flex mt-5 items-center mb-6'>
                            <GripVertical className='text-gray-400 w-8 h-8' />
                            <p className='text-gray-300 font-bold text-2xl ml-2'>Nome do Estudo</p>
                        </div>

                        <div className="flex flex-wrap gap-4">
                            <div className="w-full">
                                <label className="block text-sm font-medium mb-1" htmlFor="nome">Nome do Estudo:</label>
                                <input
                                    type="text"
                                    id="nome"
                                    placeholder='Digite o nome do Estudo'
                                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                                />
                            </div>

                            <div className='flex justify-between gap-5'>
                                <div className="w-[60%]">
                                    <label className="block text-sm font-medium mb-1" htmlFor="responsavel">Responsável Técnico:</label>
                                    <input
                                        type="text"
                                        id="responsavel"
                                        placeholder='Nome do Responsável'
                                        className="w-full border border-gray-300 rounded-md px-3 py-2"
                                    />
                                </div>

                                <div className="w-[40%]">
                                    <label className="block text-sm font-medium mb-1" htmlFor="matricula">Matrícula do terreno:</label>
                                    <input
                                        type="text"
                                        id="matricula"
                                        placeholder='Nº da Matrícula'
                                        className="w-full border border-gray-300 rounded-md px-3 py-2"
                                    />
                                </div>
                            </div>

                            <div className='flex justify-between gap-5'>
                                <div className="w-[60%]">
                                    <label className="block text-sm font-medium mb-1" htmlFor="estado">Estado:</label>
                                    <input
                                        type="text"
                                        id="estado"
                                        placeholder='Digite o nome do Estado'
                                        className="w-full border border-gray-300 rounded-md px-3 py-2"
                                    />
                                </div>

                                <div className="w-[40%]">
                                    <label className="block text-sm font-medium mb-1" htmlFor="cidade">Cidade:</label>
                                    <input
                                        type="text"
                                        id="cidade"
                                        placeholder='Digite o nome da Cidade'
                                        className="w-full border border-gray-300 rounded-md px-3 py-2"
                                    />
                                </div>
                            </div>

                            <div className="w-full">
                                <label className="block text-sm font-medium mb-1" htmlFor="observacoes">Observações Internas:</label>
                                <textarea
                                    id="observacoes"
                                    rows="4"
                                    placeholder='Comentários importantes'
                                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                                />
                            </div>
                        </div>
                    </div>
                    <div>
                        <img src={ImgEstudo} alt="" />
                    </div>

                    <div />
                </div>
            </form>
            {/* Mapa MapBox */}
            <div className='flex justify-center'>

                <MapComponent className="rounded-xl mt-10 mb-20 " />
            </div>
        </>
    );
}

export default Estudo;
