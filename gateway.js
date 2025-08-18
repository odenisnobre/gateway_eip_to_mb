
/*
Vale Base Metals
Denis Nobre - Salobo
08/2025
*/

/* Carrega modulos */
const ModbusRTU = require("modbus-serial");
const { Controller, Tag } = require("ethernet-ip");
const { conectarPLC, simuladorHR } = require('./utils/funcs');
const fs = require('fs');
const path = require('path');

