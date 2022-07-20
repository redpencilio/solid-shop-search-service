export function objectToString(object) {
    if (object.termType === 'NamedNode') {
        return `<${object.value}>`;
    } else if (object.termType === 'BlankNode') {
        return `_:${object.value}`;
    } else if (object.termType === 'Literal') {
        if (object.datatype.value === 'http://www.w3.org/2001/XMLSchema#string') {
            return `"${object.value}"`;
        } else if (object.datatype.value === 'http://www.w3.org/2001/XMLSchema#integer') {
            return `"${object.value}"^^xsd:integer`;
        } else if (object.datatype.value === 'http://www.w3.org/2001/XMLSchema#decimal') {
            return `"${object.value}"^^xsd:decimal`;
        } else if (object.datatype.value === 'http://www.w3.org/2001/XMLSchema#float') {
            return `"${object.value}"^^xsd:float`;
        } else if (object.datatype.value === 'http://www.w3.org/2001/XMLSchema#double') {
            return `"${object.value}"^^xsd:double`;
        } else if (object.datatype.value === 'http://www.w3.org/2001/XMLSchema#boolean') {
            return `"${object.value}"^^xsd:boolean`;
        } else {
            throw new Error(`Unsupported datatype ${object.datatype.value}`);
        }
    } else if (object.type === 'typed-literal') {
        return objectToString({value: object.value, termType: 'Literal', datatype: {value: object.datatype}});
    } else {
        throw new Error(`Unknown term type ${object.termType}`);
    }
}
