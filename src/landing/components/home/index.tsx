import { h } from "preact";
import ProjectTableContainer from "./projectTable";
import MutableArrayDataProvider = require("ojs/ojmutablearraydataprovider");
import { useEffect, useState } from "preact/hooks";
import ProjectDetailsContainer from "./projectDetails";
import "ojs/ojprogress-circle";


let INIT_SELECTEDPROJECT: any | null = null;

// Props coming from the parent component
type Props = {
  onRackChanged: (value: RackMetadata) => void;
  vendor?: string;
  region: string;
}

type RackMetadata = {
    building: string;
    block: string;
    rack: string;
    ticket?: string;
    rackSerialNumber?: string;
    resolveEnabled?: boolean;
    resolveDisabledReason?: string;
}

type ProjectMetadata = {
    projectId: string;
    building: string;
    blocks: string[];
}

const API_URL = window.location.host.includes('localhost') ? "http://localhost:21000/lvv" : `https://${window.location.host}/lvv`;

const HomeContainer = (props: Props) => {

    const [projectList, setProjectList] = useState<any[]>([]);

    //This gets updated every time the projectList changes
    let projectListProvider = new MutableArrayDataProvider<any, any>(projectList, { keyAttributes: "projectId" })

    const [isLoading, setIsLoading] = useState(false);

    const vendorUrl = `${API_URL}/projects?vendorName=${props.vendor}&regionName=${props.region}`
    let params = '';
    if (props.region) {
        params = `regionName=${encodeURIComponent(props.region)}`;
    }
    const masterUrl = `${API_URL}/allProjects${params ? `?${params}` : ''}`;

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);

            let projects = [];
            let vendorResponse;

            try {
                // Fetch from vendorUrl
                const vendorFetch = await fetch(vendorUrl);
                vendorResponse = await vendorFetch.json();

                // Assuming the API returns an array of projects
                if (Array.isArray(vendorResponse) && vendorResponse.length === 0) {
                    // vendorUrl returned empty: try masterUrl
                    try {
                        const masterFetch = await fetch(masterUrl);
                        if (masterFetch.status === 404) {
                            // masterUrl returns 404: fallback to vendorResponse
                            projects = vendorResponse;
                        } else {
                            projects = await masterFetch.json();
                        }
                    } catch (error) {
                        // Error fetching masterUrl: fallback to vendorResponse
                        projects = vendorResponse;
                    }
                } else {
                    // vendorUrl returned data
                    projects = vendorResponse;
                }
            } catch (error) {
                // Error fetching vendorUrl
                projects = []; // or handle error as needed
            }

            setProjectList(projects);
            setIsLoading(false);
        };

        if (props.vendor) {
            fetchData();
        }
    }, [props.vendor, props.region]);

    const [selectedProject, setSelectedProject] = useState(
        INIT_SELECTEDPROJECT
    );
    const [selectedProjectRegion, setSelectedProjectRegion] = useState<string | null>(null);

    // Reset selectedProject to initial state whenever region changes
    useEffect(() => {
        setSelectedProject(INIT_SELECTEDPROJECT);
        setSelectedProjectRegion(null);
    }, [props.region]);

    const showProjectDetails = () => {
        return selectedProject != null && selectedProjectRegion === props.region;
    };

    const projectChangedHandler = (value: ProjectMetadata) => {
        setSelectedProject(value);
        setSelectedProjectRegion(props.region);
    };

    const rackSelectedHandler = (value: any) => {
        let info = {
            building: value.building,
            block: value.block,
            rack: value.rackLocation,
            ticket: value.ticketId,
            rackSerialNumber: value.rackSerialNumber,
            resolveEnabled: Boolean(value.resolveEnabled),
            resolveDisabledReason: value.resolveDisabledReason || ""
        }
        console.log("Info passed ", info);
        props.onRackChanged(info)
    };

    return (
        <div class="oj-flex oj-flex-init home-container oj-reflow">
            {/* Show loading indicator while project list is loading */}
            {isLoading
                ? (
                    <div style="display:flex; justify-content:center; align-items:center; min-height:200px;">
                        <oj-progress-circle size="md" value={-1} />
                    </div>
                )
                : <ProjectTableContainer data={projectListProvider} onProjectChanged={projectChangedHandler} />
            }
            {showProjectDetails() && (
                <ProjectDetailsContainer project={selectedProject} onRackChanged={rackSelectedHandler} region={props.region}/>
            )}
            {!showProjectDetails() && (
                <div id="parentContainer2" class="oj-flex oj-flex-item oj-md-8 oj-sm-12">
                    <h2 class="header-center">
                        Select project to view items
                    </h2>
                </div>
            )}
        </div>
    );
};

export default HomeContainer;
