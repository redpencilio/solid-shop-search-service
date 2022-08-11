import {querySudo as query, updateSudo as update} from '@lblod/mu-auth-sudo';
import {TaskStatus} from "../app";

export async function discoverPendingTasks() {
    const queryQuery = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    SELECT DISTINCT ?task ?orderId
    FROM <http://mu.semte.ch/graphs/tasks>
    WHERE {
        ?task a ext:Task;
            ext:taskType ?taskType;
            ext:taskStatus "pending";
            ext:order ?orderId.
        VALUES ?taskType { ext:SavedOrderTask ext:UpdatedOrderTask }
    }`;

    return query(queryQuery);
}

/**
 *
 * @param taskId
 * @param status: {@link TaskStatus}
 * @returns {Promise<*>}
 */
export async function setTaskStatus(taskId, status) {
    let statusString;
    switch (status) {
        case TaskStatus.PENDING:
            statusString = 'pending';
            break;
        case TaskStatus.DONE:
            statusString = 'done';
            break;
        case TaskStatus.FAILED:
            statusString = 'failed';
            break;
        default:
            throw new Error(`Unknown task status: ${status}`);
    }

    const queryUpdate = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    DELETE { GRAPH <http://mu.semte.ch/graphs/tasks> {
        <${taskId}> ext:taskStatus ?taskStatus.
    } }
    INSERT { GRAPH <http://mu.semte.ch/graphs/tasks> {
        <${taskId}> ext:taskStatus "${statusString}".
    } }
    WHERE {
        <${taskId}> ext:taskStatus ?taskStatus.
    }`;

    return await update(queryUpdate);
}
