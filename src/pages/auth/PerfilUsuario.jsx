import React, { useEffect, useState } from 'react';
import useAxios from '../../utils/useAxios';
import Swal from 'sweetalert2';
import { Camera } from 'lucide-react';

export default function PerfilUsuario() {
    const [perfil, setPerfil] = useState(null);
    const [foto, setFoto] = useState(null);
    const [previewFoto, setPreviewFoto] = useState(null);
    const axiosAuth = useAxios();

    useEffect(() => {
        const fetchPerfil = async () => {
            const { data } = await axiosAuth.get('user/');
            setPerfil(data);
            setPreviewFoto(data.foto); // já mostra a foto atual
        };
        fetchPerfil();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();

        const formData = new FormData();
        formData.append('nome', e.target.nome.value);
        formData.append('sobrenome', e.target.sobrenome.value);
        if (foto) {
            formData.append('foto', foto);
        }

        try {
            await axiosAuth.put('user/update/', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });

            Swal.fire({
                icon: 'success',
                title: 'Perfil atualizado com sucesso!',
            });

            // Atualiza o perfil novamente
            const { data } = await axiosAuth.get('user/');
            setPerfil(data);
            setPreviewFoto(data.foto);
            setFoto(null); // limpa input

        } catch (err) {
            Swal.fire({
                icon: 'error',
                title: 'Erro ao atualizar perfil',
            });
        }
    };

    const handleFotoChange = (e) => {
        const file = e.target.files[0];
        setFoto(file);
        if (file) {
            setPreviewFoto(URL.createObjectURL(file));
        }
    };

    if (!perfil) return <div className='w-full h-screen flex justify-center items-center text-5xl'>Carregando perfil...</div>;

    return (
        <div className="max-w-md mx-auto bg-white p-6 rounded-2xl shadow mt-30">
            <h2 className="text-2xl font-bold mb-4">Meu Perfil</h2>

            <form onSubmit={handleSubmit} encType="multipart/form-data">
                <label className="block mb-2 font-medium">Nome:</label>
                <input
                    type="text"
                    name="nome"
                    defaultValue={perfil.nome || ''}
                    className="w-full border px-3 py-2 rounded mb-4"
                />

                <label className="block mb-2 font-medium">Sobrenome:</label>
                <input
                    type="text"
                    name="sobrenome"
                    defaultValue={perfil.sobrenome || ''}
                    className="w-full border px-3 py-2 rounded mb-4"
                />

                <label className="block mb-2 font-medium">Foto de perfil:</label>

                {/* Componente de upload de imagem bonito */}
                <div className="relative w-32 h-32 mx-auto mb-4">
                    <input
                        type="file"
                        accept="image/*"
                        onChange={handleFotoChange}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    <div className="absolute inset-0 flex items-center justify-center border-2 border-dashed rounded-full bg-gray-100 overflow-hidden">
                        {previewFoto ? (
                            <img
                                src={previewFoto}
                                alt="Preview"
                                className="object-cover w-full h-full rounded-full"
                            />
                        ) : (
                            <Camera className="w-10 h-10 text-gray-400" />
                        )}
                    </div>
                </div>

                <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded w-full">
                    Salvar Alterações
                </button>
            </form>
        </div>
    );
}
