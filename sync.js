import {update} from 'mu';

export async function queryPod(queryEngine, pod) {
    return await (await queryEngine.queryQuads(`
  PREFIX gr: <http://purl.org/goodrelations/v1#>
  CONSTRUCT {
    ?priceSpecification a gr:PriceSpecification;
        gr:hasCurrency ?currency;
        gr:hasCurrencyValue ?currencyValue.
    ?offering a gr:Offering;
        gr:name ?name;
        gr:description ?description;
        gr:includes ?product;
        gr:hasPriceSpecification ?priceSpecification.
    ?product a gr:ProductOrService;
        gr:name ?productName;
        gr:description ?productDescription.
    ?seller a gr:BusinessEntity;
        gr:legalName ?sellerLegalName;
        gr:offers ?offering.
  }
  WHERE {
    ?priceSpecification a gr:PriceSpecification;
        gr:hasCurrency ?currency;
        gr:hasCurrencyValue ?currencyValue.
    ?offering a gr:Offering;
        gr:name ?name;
        gr:description ?description;
        gr:includes ?product;
        gr:hasPriceSpecification ?priceSpecification.
    ?product a gr:ProductOrService;
        gr:name ?productName;
        gr:description ?productDescription.
    ?seller a gr:BusinessEntity;
        gr:legalName ?sellerLegalName;
        gr:offers ?offering.
  }
  `, {
        sources: [`${pod}/private/tests/my-offerings.ttl`, `${pod}/private/tests/my-products.ttl`],
    })).toArray();
}

export async function deleteOld(pod) {
    const query = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    DELETE { GRAPH <http://mu.semte.ch/application> {
        ?s ?p ?o.
    } }
    WHERE {
        ?s ext:pod <${pod}>;
            ?p ?o.
    }`;

    return update(query);
}

export async function insert(quads, pod) {
    let triples = quads.map(quad => `<${quad.subject.value}> <${quad.predicate.value}> ${objectToString(quad.object)}.`).join('\n');
    triples = triples.concat(quads.filter(quad => quad.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type').map(quad => `<${quad.subject.value}> ext:pod <${pod}>.`).join('\n'));

    const query = `
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    INSERT DATA { GRAPH <http://mu.semte.ch/application> {
      ${triples}
    } }`;
    console.log(query);

    return update(query);
}

function objectToString(object) {
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
    } else {
        throw new Error(`Unknown term type ${object.termType}`);
    }
}
