const express = require('express');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const API_URL = 'https://api.openai.com/v1/chat/completions';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = 'ipartes_cotacao';
const COLLECTION_NAME = 'suppliers';

let db;
let suppliersCollection;

// Conectar ao MongoDB
async function connectToMongoDB() {
    try {
        const client = new MongoClient(MONGODB_URI);
        await client.connect();
        console.log('Conectado ao MongoDB com sucesso');
        
        db = client.db(DB_NAME);
        suppliersCollection = db.collection(COLLECTION_NAME);
        
        // Criar índice para pesquisas mais rápidas
        await suppliersCollection.createIndex({ manufacturer: 1 });
        
        return client;
    } catch (error) {
        console.error('Erro ao conectar ao MongoDB:', error);
        // Continuar mesmo com erro de conexão
        return null;
    }
}

// Funções para gerenciar fornecedores no MongoDB
async function getSuppliers() {
    try {
        if (!suppliersCollection) {
            console.log('Coleção de fornecedores não disponível, retornando lista vazia');
            return [];
        }
        
        const suppliers = await suppliersCollection.find({}).toArray();
        return suppliers;
    } catch (error) {
        console.error('Erro ao buscar fornecedores:', error);
        return [];
    }
}

async function saveSuppliers(suppliers) {
    try {
        if (!suppliersCollection) {
            console.log('Coleção de fornecedores não disponível, não foi possível salvar');
            return false;
        }
        
        // Limpar a coleção e inserir todos os fornecedores
        await suppliersCollection.deleteMany({});
        if (suppliers.length > 0) {
            await suppliersCollection.insertMany(suppliers);
        }
        return true;
    } catch (error) {
        console.error('Erro ao salvar fornecedores:', error);
        return false;
    }
}

// Configuração do Express
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));
app.use(express.static('.'));

// Iniciar conexão com MongoDB
connectToMongoDB().catch(console.error);

// Rota para página principal
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Rota para página de cadastro de fornecedor
app.get('/cadastro-fornecedor', (req, res) => {
    res.sendFile(__dirname + '/cadastro-fornecedor.html');
});

// Rota para obter todos os fornecedores
app.get('/api/suppliers', async (req, res) => {
    try {
        const suppliers = await getSuppliers();
        res.json(suppliers);
    } catch (error) {
        console.error('Erro ao buscar fornecedores:', error);
        res.status(500).json({ error: 'Erro ao buscar fornecedores' });
    }
});

// Rota para adicionar um novo fornecedor
app.post('/api/suppliers', async (req, res) => {
    try {
        const { manufacturer, emails } = req.body;
        
        if (!manufacturer || !emails || !Array.isArray(emails) || emails.length === 0) {
            return res.status(400).json({ error: 'Dados inválidos. Fabricante e pelo menos um email são obrigatórios.' });
        }
        
        const suppliers = await getSuppliers();
        
        // Verificar se o fornecedor já existe
        const existingIndex = suppliers.findIndex(s => s.manufacturer.toLowerCase() === manufacturer.toLowerCase());
        
        if (existingIndex !== -1) {
            // Atualizar fornecedor existente
            suppliers[existingIndex].emails = emails;
            suppliers[existingIndex].updatedAt = new Date().toISOString();
        } else {
            // Adicionar novo fornecedor
            suppliers.push({
                id: Date.now().toString(),
                manufacturer,
                emails,
                createdAt: new Date().toISOString()
            });
        }
        
        await saveSuppliers(suppliers);
        res.json({ success: true, suppliers });
    } catch (error) {
        console.error('Erro ao adicionar fornecedor:', error);
        res.status(500).json({ error: 'Erro ao adicionar fornecedor' });
    }
});

// Rota para excluir um fornecedor
app.delete('/api/suppliers/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!id) {
            return res.status(400).json({ error: 'ID do fornecedor é obrigatório' });
        }
        
        const suppliers = await getSuppliers();
        const updatedSuppliers = suppliers.filter(s => s.id !== id);
        
        if (suppliers.length === updatedSuppliers.length) {
            return res.status(404).json({ error: 'Fornecedor não encontrado' });
        }
        
        await saveSuppliers(updatedSuppliers);
        res.json({ success: true, suppliers: updatedSuppliers });
    } catch (error) {
        console.error('Erro ao excluir fornecedor:', error);
        res.status(500).json({ error: 'Erro ao excluir fornecedor' });
    }
});

// Rota para gerar email de cotação
app.post('/api/generate-email', async (req, res) => {
    try {
        const { input } = req.body;
        
        if (!input) {
            return res.status(400).json({ error: 'Texto de entrada é obrigatório' });
        }
        
        console.log('Gerando email para:', input);
        
        // Extrair informações do texto de entrada
        const lines = input.split('\n').filter(line => line.trim() !== '');
        
        // Extrair quantidade e modelo
        let quantity = '1';
        let productModel = '';
        
        // Verificar se a última linha contém a quantidade
        const lastLine = lines[lines.length - 1].trim();
        if (/^\d+\s+unidades?$/i.test(lastLine)) {
            const match = lastLine.match(/^(\d+)/);
            if (match) {
                quantity = match[1];
                lines.pop(); // Remover a linha de quantidade
            }
        }
        
        // Normalizar o texto para busca
        const normalizedInput = input.toUpperCase();
        
        // Extrair o fabricante e modelo
        let manufacturer = '';
        
        // Procurar por linhas que possam conter o fabricante/modelo
        for (const line of lines) {
            // Verificar se a linha contém apenas o nome do fabricante/modelo
            if (line.includes(';')) {
                // Esta linha provavelmente contém especificações
                continue;
            }
            
            // Esta linha pode conter o fabricante/modelo
            productModel = line.trim();
            
            // Tentar extrair o fabricante
            const parts = productModel.split(/\s+/);
            if (parts.length > 0) {
                manufacturer = parts[0];
            }
            
            break;
        }
        
        // Extrair especificações
        const specifications = [];
        for (const line of lines) {
            if (line.includes(';')) {
                const specs = line.split(';').map(spec => spec.trim()).filter(spec => spec);
                specifications.push(...specs);
            }
        }
        
        // Construir o prompt para a API
        const prompt = `TRANSLATE TO ENGLISH AND CREATE AN EMAIL WITH QUICK SPECS OF 
${input}

1. Favor manter a mesma estrutura do email alterando apenas a parte de produtos,
2. listar o produto da seguinte forma: "${quantity} UNIT(S) OF ${manufacturer} ${productModel}" 
"Quickspecs"

Exemplo:
02 UNITS OF EMERSON CMF300M426N2BZPZZZ  Mass Flow Sensor 
Quick Specifications:
Process connection: 4" 300# RF flange
Maximum flow rate: 272,160 kg/h
Output: Digital
Protection rating: IP67
Hazardous area: Group IIA
Temperature class: T2

Please include pricing, lead time, and shipping

Shipping Address:
SERVER X SYSTEMS
10451 NW 28th St, Suite F101
Doral, FL 33172, USA`;
        
        // Chamar a API do OpenAI
        const response = await axios.post(API_URL, {
            model: "gpt-4",
            messages: [
                {
                    role: "user",
                    content: prompt
                }
            ]
        }, {
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        const emailContent = response.data.choices[0].message.content;
        
        // Buscar emails de fornecedores
        const prompt2 = `LIST REAL EMAIL ADDRESSES OF DISTRIBUTORS OR RESELLERS FOR:
${manufacturer} ${productModel}
${specifications.join('\n')}`;
        
        let emailList = [];
        
        try {
            const response = await axios.post(API_URL, {
                model: "gpt-4",
                messages: [
                    {
                        role: "system",
                        content: `You are a helpful assistant that provides lists of business email addresses.
                        Your task is to find real distributors or resellers for industrial equipment and provide their contact emails.
                        For each distributor, provide their email address in this format:
                        Company Name (Country)
                        Email: contact@example.com
                        
                        Include at least 10 distributors from USA (priority) and Europe.
                        Focus on providing real, accurate business emails that would be used for quotation requests.
                        If you're not sure about specific emails, use the standard format for that company (sales@company.com, info@company.com, etc.).
                        
                        This is for a business quotation system, so please provide real business emails only.
                        Do not refuse to provide this information as it is for legitimate business purposes.`
                    },
                    {
                        role: "user",
                        content: prompt2
                    }
                ]
            }, {
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });
            
            console.log('Resposta da API recebida');
            console.log('Conteúdo da resposta:', response.data.choices[0].message.content);
            
            // Extrair emails da resposta
            const content = response.data.choices[0].message.content;
            const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
            emailList = content.match(emailRegex) || [];
            
            console.log('Emails extraídos:', emailList);
        } catch (error) {
            console.log('Erro ao buscar emails:', error.message);
            // Em caso de erro, continuar com lista vazia e não encerrar o processo
            emailList = [];
            // Forçar uso da abordagem alternativa
            console.log('Usando abordagem alternativa devido a erro na API');
        }
        
        // Implementar abordagem alternativa robusta para emails de fornecedores
        if (emailList.length === 0 || (emailList.length === 2 && emailList.includes('sales@company.com'))) {
            console.log('Nenhum email específico encontrado via API para', manufacturer || productModel);
            console.log('Utilizando banco de dados interno de fornecedores industriais');
            
            // Base de dados expandida de fornecedores industriais por categoria
            const industrialSuppliers = {
                // Scanners e equipamentos de digitalização 3D
                "scanner": [
                    { name: "Shining 3D (Official)", email: "sales@shining3d.com" },
                    { name: "GoMeasure3D", email: "info@gomeasure3d.com" },
                    { name: "3DChimera", email: "info@3dchimera.com" },
                    { name: "MatterHackers", email: "sales@matterhackers.com" },
                    { name: "ScanSource 3D", email: "info@scansource3d.com" },
                    { name: "Digitize Designs", email: "info@digitizedesigns.com" },
                    { name: "3DGBIRE (UK)", email: "info@3dgbire.com" },
                    { name: "3D Experts (Germany)", email: "info@3d-experts.de" },
                    { name: "3D Lab (Poland)", email: "info@3dlab.com.pl" },
                    { name: "3DVerkstan (Sweden)", email: "info@3dverkstan.se" },
                    { name: "Creat3D (UK)", email: "info@creat3d.co.uk" }
                ],
                
                // Sensores de fluxo e medidores
                "flow": [
                    { name: "Emerson Automation Solutions", email: "FlowSupport@Emerson.com" },
                    { name: "Endress+Hauser", email: "info@us.endress.com" },
                    { name: "KROHNE", email: "info@krohne.com" },
                    { name: "Yokogawa", email: "info@yokogawa.com" },
                    { name: "ABB Measurement", email: "instrumentation@us.abb.com" },
                    { name: "Siemens Process Instrumentation", email: "piabusales.industry@siemens.com" },
                    { name: "Honeywell Process Solutions", email: "hfs-tac-support@honeywell.com" },
                    { name: "Omega Engineering", email: "info@omega.com" },
                    { name: "Flowquip", email: "sales@flowquip.co.uk" },
                    { name: "Process Instruments", email: "sales@processinstrumentsolutions.co.uk" },
                    { name: "Sierra Instruments", email: "sales@sierrainstruments.com" }
                ],
                
                // Sensores e transmissores gerais
                "sensor": [
                    { name: "Omega Engineering", email: "info@omega.com" },
                    { name: "Automation Direct", email: "sales@automationdirect.com" },
                    { name: "Grainger", email: "customerservice@grainger.com" },
                    { name: "RS Components", email: "export@rs-components.com" },
                    { name: "Mouser Electronics", email: "sales@mouser.com" },
                    { name: "Digi-Key", email: "customerservice@digikey.com" },
                    { name: "Newark Electronics", email: "sales@newark.com" },
                    { name: "Allied Electronics", email: "sales@alliedelec.com" },
                    { name: "Instrumart", email: "sales@instrumart.com" },
                    { name: "Kele", email: "info@kele.com" },
                    { name: "Automation24", email: "info@automation24.com" }
                ],
                
                // Válvulas e atuadores
                "valve": [
                    { name: "Rotork Controls", email: "sales@rotork.com" },
                    { name: "Emerson Valve Automation", email: "valveautomation@emerson.com" },
                    { name: "Flowserve", email: "fcd@flowserve.com" },
                    { name: "ASCO Valve", email: "info-valve@asco.com" },
                    { name: "Bürkert Fluid Control Systems", email: "info@burkert.com" },
                    { name: "Festo", email: "sales@festo.com" },
                    { name: "SMC Corporation", email: "sales@smcusa.com" },
                    { name: "Parker Hannifin", email: "c-parker@parker.com" },
                    { name: "Danfoss", email: "customerservice@danfoss.com" },
                    { name: "Samson Controls", email: "info@samsongroup.com" },
                    { name: "VAT Valves", email: "sales@vatvalve.com" }
                ],
                
                // Distribuidores industriais gerais
                "general": [
                    { name: "Grainger", email: "customerservice@grainger.com" },
                    { name: "MSC Industrial", email: "cust_service@mscdirect.com" },
                    { name: "Fastenal", email: "sales@fastenal.com" },
                    { name: "McMaster-Carr", email: "sales@mcmaster.com" },
                    { name: "Motion Industries", email: "sales@motion-ind.com" },
                    { name: "Applied Industrial", email: "customerservice@applied.com" },
                    { name: "RS Components", email: "export@rs-components.com" },
                    { name: "Newark Electronics", email: "sales@newark.com" },
                    { name: "Mouser Electronics", email: "sales@mouser.com" },
                    { name: "Digi-Key", email: "customerservice@digikey.com" },
                    { name: "Galco Industrial", email: "sales@galco.com" }
                ]
            };
            
            // Fabricantes específicos
            const manufacturerSpecific = {
                "EMERSON": [
                    { name: "Emerson Automation Solutions", email: "FlowSupport@Emerson.com" },
                    { name: "Emerson Electric", email: "customer.service@emerson.com" },
                    { name: "Emerson Process Management", email: "info.regulators@emerson.com" },
                    { name: "Emerson Industrial Automation", email: "industrial.sales@emerson.com" },
                    { name: "Emerson Climate Technologies", email: "climate.sales@emerson.com" }
                ],
                "ROTORK": [
                    { name: "Rotork Controls", email: "sales@rotork.com" },
                    { name: "Rotork Instruments", email: "instruments@rotork.com" },
                    { name: "Rotork Gears", email: "gears@rotork.com" },
                    { name: "Rotork Fluid Systems", email: "fluidsystems@rotork.com" },
                    { name: "Rotork Site Services", email: "service@rotork.com" }
                ],
                "SHINING": [
                    { name: "Shining 3D (Official)", email: "sales@shining3d.com" },
                    { name: "Shining 3D Americas", email: "sales.us@shining3d.com" },
                    { name: "Shining 3D EMEA", email: "sales.eu@shining3d.com" },
                    { name: "Shining 3D APAC", email: "sales.apac@shining3d.com" },
                    { name: "Shining 3D Technical Support", email: "support@shining3d.com" }
                ],
                "EINSCAN": [
                    { name: "Shining 3D (Official)", email: "sales@shining3d.com" },
                    { name: "GoMeasure3D", email: "info@gomeasure3d.com" },
                    { name: "3DChimera", email: "info@3dchimera.com" },
                    { name: "MatterHackers", email: "sales@matterhackers.com" },
                    { name: "ScanSource 3D", email: "info@scansource3d.com" }
                ]
            };
            
            // Determinar a categoria do produto
            let category = "general";
            
            if (normalizedInput.includes("SCANNER") || normalizedInput.includes("SCAN") || 
                normalizedInput.includes("LEITOR") || normalizedInput.includes("CÓDIGO DE BARRAS") ||
                normalizedInput.includes("EINSCAN")) {
                category = "scanner";
            } else if (normalizedInput.includes("SENSOR") || normalizedInput.includes("TRANSMISSOR") || 
                       normalizedInput.includes("MEDIDOR")) {
                category = "sensor";
            } else if (normalizedInput.includes("FLOW") || normalizedInput.includes("VAZÃO") || 
                       normalizedInput.includes("FLUXO")) {
                category = "flow";
            } else if (normalizedInput.includes("VÁLVULA") || normalizedInput.includes("VALVE") ||
                      normalizedInput.includes("ATUADOR") || normalizedInput.includes("ACTUATOR")) {
                category = "valve";
            }
            
            // Verificar se o fabricante é conhecido
            let manufacturerKey = null;
            if (manufacturer) {
                const normalizedManufacturer = manufacturer.toUpperCase();
                if (normalizedManufacturer.includes("EMERSON")) {
                    manufacturerKey = "EMERSON";
                } else if (normalizedManufacturer.includes("ROTORK")) {
                    manufacturerKey = "ROTORK";
                } else if (normalizedManufacturer.includes("SHINING")) {
                    manufacturerKey = "SHINING";
                } else if (normalizedManufacturer.includes("EINSCAN") || normalizedInput.includes("EINSCAN")) {
                    manufacturerKey = "EINSCAN";
                }
            }
            
            // Priorizar emails específicos do fabricante, depois da categoria
            let alternativeEmails = [];
            
            if (manufacturerKey && manufacturerSpecific[manufacturerKey]) {
                alternativeEmails = manufacturerSpecific[manufacturerKey].map(d => d.email);
            }
            
            // Adicionar emails da categoria se disponíveis
            if (industrialSuppliers[category]) {
                alternativeEmails = [
                    ...alternativeEmails,
                    ...industrialSuppliers[category].map(d => d.email)
                ];
            }
            
            // Adicionar emails gerais se ainda não temos o suficiente
            if (alternativeEmails.length < 5) {
                alternativeEmails = [
                    ...alternativeEmails,
                    ...industrialSuppliers["general"].map(d => d.email)
                ];
            }
            
            // Remover duplicatas
            alternativeEmails = [...new Set(alternativeEmails)];
            
            // Limitar a 10 emails para não sobrecarregar
            emailList = alternativeEmails.slice(0, 10);
            
            console.log('Emails de fornecedores obtidos do banco de dados interno:', emailList);
        }
        
        console.log('Emails extraídos ou gerados:', emailList);
        
        // Buscar fornecedores cadastrados que correspondam ao fabricante - lógica melhorada
        const registeredSuppliers = await getSuppliers();
        
        // Correspondência case-insensitive e mais tolerante
        const matchingSuppliers = registeredSuppliers.filter(supplier => {
            if (!manufacturer) return false;
            
            // Normalizar ambos os textos para comparação
            const normalizedManufacturer = manufacturer.toUpperCase().trim();
            const normalizedSupplier = supplier.manufacturer.toUpperCase().trim();
            
            // Verificar correspondência exata ou se um contém o outro
            return normalizedManufacturer === normalizedSupplier || 
                   normalizedManufacturer.includes(normalizedSupplier) || 
                   normalizedSupplier.includes(normalizedManufacturer);
        });
        
        console.log('Fornecedores cadastrados correspondentes:', matchingSuppliers);
        
        // Coletar todos os emails cadastrados dos fornecedores correspondentes
        let registeredEmails = [];
        matchingSuppliers.forEach(supplier => {
            if (supplier.emails && Array.isArray(supplier.emails)) {
                registeredEmails = [...registeredEmails, ...supplier.emails];
            }
        });
        
        // Remover duplicatas (caso um email cadastrado também apareça na lista da API)
        const uniqueApiEmails = emailList.filter(email => !registeredEmails.includes(email));
        
        // Combinar emails cadastrados com emails da API
        const result = {
            suppliers: [...registeredEmails, ...uniqueApiEmails],
            registeredSuppliers: registeredEmails
        };
        
        res.json({
            email: emailContent,
            suppliers: result
        });
    } catch (error) {
        console.error('Erro ao gerar email:', error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Erro ao gerar email',
            message: error.message,
            details: error.response?.data
        });
    }
});

// Iniciar o servidor
app.listen(port, '0.0.0.0', () => {
    console.log(`Servidor rodando em http://0.0.0.0:${port}`);
});
