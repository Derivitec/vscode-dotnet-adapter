"use strict";
import * as vscode from 'vscode';
//@ts-ignore
import { DOMParser, Element, Node } from "xmldom";
import { TestResult } from "./TestResult";

const fs = vscode.workspace.fs;

function findChildElement(node: Node, name: string): Node {
    let child = node.firstChild;
    while (child) {
        if (child.nodeName === name) {
            return child;
        }

        child = child.nextSibling;
    }

    return null;
}

function getAttributeValue(node: Node, name: string): string {
    const attribute = node.attributes.getNamedItem(name);
    return (attribute === null) ? null : attribute.nodeValue;
}

function getTextContentForTag(parentNode: Node, tagName: string): string {
    const node = parentNode.getElementsByTagName(tagName);
    return node.length > 0 ? node[0].textContent : "";
}

function parseUnitTestResults(xml: Element): TestResult[] {
    const results: TestResult[] = [];
    const nodes = xml.getElementsByTagName("UnitTestResult");

    // TSLint wants to use for-of here, but nodes doesn't support it
    for (let i = 0; i < nodes.length; i++) { // tslint:disable-line

        results.push(new TestResult(
            getAttributeValue(nodes[i], "testId"),
            getAttributeValue(nodes[i], "outcome"),
            getTextContentForTag(nodes[i], "Message"),
            getTextContentForTag(nodes[i], "StackTrace"),
        ));
    }

    return results;
}

function updateUnitTestDefinitions(xml: Element, results: TestResult[]): void {
    const nodes = xml.getElementsByTagName("UnitTest");
    const names = new Map<string, any>();

    for (let i = 0; i < nodes.length; i++) { // tslint:disable-line
        const id = getAttributeValue(nodes[i], "id");
        const testMethod = findChildElement(nodes[i], "TestMethod");
        if (testMethod) {
            names.set(id, {
                className: getAttributeValue(testMethod, "className"),
                method: getAttributeValue(testMethod, "name"),
            });
        }
    }

    for (const result of results) {
        const name = names.get(result.id);
        if (name) {
            result.updateName(name.className, name.method);
        }
    }
}

const parseTestResults = async (filePath: string): Promise<TestResult[]> => {
    let results: TestResult[];
    const fileUri = vscode.Uri.file(filePath)
    const data = (await fs.readFile(fileUri)).toString();
    const xdoc = new DOMParser().parseFromString(data, "application/xml");
    results = parseUnitTestResults(xdoc.documentElement);

    updateUnitTestDefinitions(xdoc.documentElement, results);

    try {
        await fs.delete(fileUri);
    } catch {}

    return results;
}

export {
    parseTestResults,
}
