## EIP Gateway

#### Objetivos
O Gateway tem a finalidade de converter o protocolo Ethernet/IP(padrão Rockwell) para o protocolo Modbus TCP.
Uma vez disponibilizado os dados via Modbus TCP pelo Gateway as informações serão lidas pelo sistema da ABB, 800 XA.


#### Arquitetura Básica
A arquitetura básica, de alto nível, é representada na imagem abaixo.
O protocolo Ethernet/IP possui porta padrão de comunicação 44818 e o Modbus TCP possui porta padrão 502 mas, para este desenvolvimento, foi utilizado a porta 8502 que pode ser parametrizável.
<img width="905" height="419" alt="image" src="https://github.com/user-attachments/assets/183055c4-1d21-4758-a512-89824928d357" />
<img width="654" height="387" alt="image" src="https://github.com/user-attachments/assets/167681f4-0a3c-49f1-92a3-1b7e529e8165" />



#### Desenvolvimento
Para o desenvolvimento do Gateway foi utilizado a linguagem Nodejs por possuir bibliotecas padrão mais consolidadas para lidar com informações no protocolo Ethernet/IP.
O Gateway possui um arquivo json de configuração que serve como base para todo o funcionamento do Gateway.
Os principais parâmetros do Gateway são:
  - IP do controlador
  - Slot do controlador
  - Variáveis de leitura do PLC e o seu formato(Coil ou HoldingRegisters) que serão disponibilizados pelo protocolo Modbus TCP.
O endereço da variável no protocolo Modbus segue a ordem das varíáveis setadas no arquivo de configuração.

#### Comandos importantes

Alguns comando para gerar o executáveçel:
  - Instalar pkg
  - npm i
  - npm run build:win
