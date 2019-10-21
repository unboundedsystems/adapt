import Adapt from "@adpt/core";

import Nodecellar from "./app";
import awsStyle from "./aws";
import k8sStyle from "./k8s";

const app = <Nodecellar />;

Adapt.stack("aws", app, awsStyle);
Adapt.stack("k8s", app, k8sStyle);
